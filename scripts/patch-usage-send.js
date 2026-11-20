#!/usr/bin/env node
/**
 * Keep the composer send button enabled for non-ChatGPT models when the
 * ChatGPT account is out of usage.
 *
 * Upstream has shipped two shapes for the quota gate:
 *
 * - 26.1106..26.1111: "usage-limit" and "reserve-limit" were appended to
 *   submitDisabledReasons in the same module that holds the composer's model
 *   state (`aW=nz&&"reserve-limit",aK=aT&&"usage-limit"`). Gate both reasons
 *   on the model that will actually be sent (USAGE_RE pass).
 *
 * - 26.1117 refactored the gate into a standalone per-host atom —
 *   `[hardBlocked&&"reserve-limit","local"===host&&usage&&"usage-limit"]`
 *   `.filter(Boolean).join(",")` — with no model in scope. The two minified
 *   composer copies read that atom and append it as the last element of the
 *   submitDisabledReasons array before joining, right where the model state
 *   lives: gate the joined result on the selected model instead
 *   (MODEL_RE + ASSEMBLY_RE pass). The join is re-evaluated on every render,
 *   so the check never goes stale when the model changes.
 */
const fs = require("fs");
const path = require("path");
const { relPath, SRC_DIR, parsePlatformArg, existingAsarPlatforms, walkAssetFiles } = require("./patch-util");

const IDENT = "[A-Za-z_$][\\w$]*";
const USAGE_RE =
  /([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)&&"reserve-limit",([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)&&"usage-limit"/g;
const MODEL_RE =
  /([A-Za-z_$][\w$]*)\.settings\.model===([A-Za-z_$][\w$]*)\.qz\?[A-Za-z_$][\w$]*!==([A-Za-z_$][\w$]*)\.model:\1\.settings\.model!==\3\.model/g;
const ASSEMBLY_RE =
  /\(([A-Za-z_$][\w$]*)=\[((?:[A-Za-z_$][\w$]*,){6,})([A-Za-z_$][\w$]*)\]\.filter\(Boolean\)/g;
const ALREADY = 'function(e){return!e||/^(?:codex-|gpt-)|(?:^o\\d)/.test(e)}';

function quotaCheck(selection, mode) {
  return `function(e){return!e||/^(?:codex-|gpt-)|(?:^o\\d)/.test(e)}((null!=${selection}&&${selection}.model)||${mode}.settings.model||"")`;
}

function consumerQuotaCheck(thread, settings) {
  return `function(e){return!e||/^(?:codex-|gpt-)|(?:^o\\d)/.test(e)}((null!=${thread}&&${thread}.model)||(null!=${settings}&&${settings}.settings.model)||"")`;
}

/**
 * 26.1117+: inside each composer copy, find the "model that will be sent"
 * ternary, then the submitDisabledReasons assembly that follows it, and gate
 * the joined string on that model. The usage atom read is the array's last
 * element; strip it when the model is not a ChatGPT-account model.
 */
function patchConsumerReasonsJoin(source) {
  const edits = [];
  MODEL_RE.lastIndex = 0;
  for (const match of source.matchAll(MODEL_RE)) {
    const settings = match[1];
    const thread = match[3];
    const window = source.slice(match.index, match.index + 20000);
    for (const asm of window.matchAll(ASSEMBLY_RE)) {
      const arrayVar = asm[1];
      const reasons = asm[3];
      // The last element must be the quota-reasons atom read `(0,X._U)(...)`.
      const readRe = new RegExp(`(?:^|[^\\w$])${reasons}=\\(0,${IDENT}\\._U\\)\\(`);
      if (!readRe.test(source)) continue;
      const tail = window.slice(asm.index + asm[0].length, asm.index + asm[0].length + 800);
      const joinRe = new RegExp("let (" + IDENT + ")=" + arrayVar + '\\.join\\(","\\)');
      const join = joinRe.exec(tail);
      if (!join) continue;
      const check = consumerQuotaCheck(thread, settings);
      const start = match.index + asm.index + asm[0].length + join.index;
      edits.push({
        start,
        end: start + join[0].length,
        text: `let ${join[1]}=${check}?${arrayVar}.join(","):${arrayVar}.filter(function(e){return e!==${reasons}}).join(",")`,
      });
      break;
    }
  }
  if (edits.length === 0) return { source, changed: false };
  let out = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return { source: out, changed: true };
}

function patchInSource(source) {
  if (source.includes(ALREADY)) return { source, status: "already" };
  let changed = false;
  let next = source;

  if (next.includes('"usage-limit"')) {
    next = next.replace(USAGE_RE, (match, reserveName, hard, usageName, usageFlag, offset) => {
      const before = source.slice(Math.max(0, offset - 12000), offset);
      const models = [...before.matchAll(MODEL_RE)];
      if (models.length === 0) return match;
      const last = models[models.length - 1];
      const check = quotaCheck(last[3], last[1]);
      changed = true;
      return `${reserveName}=${hard}&&${check}&&"reserve-limit",${usageName}=${usageFlag}&&${check}&&"usage-limit"`;
    });
  }

  if (!changed) {
    const result = patchConsumerReasonsJoin(next);
    next = result.source;
    changed = result.changed;
  }

  if (!changed) return { source, status: "missing" };
  return { source: next, status: "patched" };
}

function assetsDir(platform) {
  return path.join(SRC_DIR, platform, "_asar", "webview", "assets");
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--check");
  const platform = parsePlatformArg(args) || existingAsarPlatforms()[0] || "linux-x64";
  const dir = assetsDir(platform);
  if (!fs.existsSync(dir)) {
    console.error(`  [!] assets dir missing: ${dir} — run npm run sync first`);
    process.exit(1);
  }
  let hit = false;
  for (const filePath of walkAssetFiles(dir, [".js"])) {
    const source = fs.readFileSync(filePath, "utf8");
    const result = patchInSource(source);
    if (result.status === "missing") continue;
    hit = true;
    if (result.status === "already") {
      console.log(`  [ok] ${relPath(filePath)}: usage-send already applied`);
      continue;
    }
    if (dryRun) {
      console.log(`  [?] ${relPath(filePath)}: would patch (usage-send)`);
      continue;
    }
    fs.writeFileSync(filePath, result.source, "utf8");
    console.log(`  [ok] ${relPath(filePath)}: patched (usage-send)`);
  }
  if (!hit) {
    console.error("[x] usage-send: no composer usage-limit gate");
    process.exit(1);
  }
}

module.exports = { patchInSource, patchConsumerReasonsJoin, ALREADY };

if (require.main === module) {
  main();
}
