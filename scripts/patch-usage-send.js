#!/usr/bin/env node
/**
 * Keep the composer send button enabled for non-ChatGPT models when the
 * ChatGPT account is out of usage.
 *
 * 26.1106 adds "usage-limit" and "reserve-limit" to submitDisabledReasons
 * whenever the local host's ChatGPT rate limit is exhausted. That disables
 * send for BYOK and shim models too. Gate both reasons on the model that
 * will actually be sent.
 */
const fs = require("fs");
const path = require("path");
const { relPath, SRC_DIR, parsePlatformArg, existingAsarPlatforms, walkAssetFiles } = require("./patch-util");

const USAGE_RE =
  /([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)&&"reserve-limit",([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)&&"usage-limit"/g;
const MODEL_RE =
  /([A-Za-z_$][\w$]*)\.settings\.model===([A-Za-z_$][\w$]*)\.qz\?[A-Za-z_$][\w$]*!==([A-Za-z_$][\w$]*)\.model:\1\.settings\.model!==\3\.model/g;
const ALREADY = 'function(e){return!e||/^(?:codex-|gpt-)|(?:^o\\d)/.test(e)}';

function quotaCheck(selection, mode) {
  return `function(e){return!e||/^(?:codex-|gpt-)|(?:^o\\d)/.test(e)}((null!=${selection}&&${selection}.model)||${mode}.settings.model||"")`;
}

function patchInSource(source) {
  if (!source.includes('"usage-limit"')) return { source, status: "missing" };
  if (source.includes(ALREADY)) return { source, status: "already" };
  let changed = false;
  const next = source.replace(USAGE_RE, (match, reserveName, hard, usageName, usageFlag, offset) => {
    const before = source.slice(Math.max(0, offset - 12000), offset);
    const models = [...before.matchAll(MODEL_RE)];
    if (models.length === 0) return match;
    const last = models[models.length - 1];
    const check = quotaCheck(last[3], last[1]);
    changed = true;
    return `${reserveName}=${hard}&&${check}&&"reserve-limit",${usageName}=${usageFlag}&&${check}&&"usage-limit"`;
  });
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

module.exports = { patchInSource, ALREADY };

if (require.main === module) {
  main();
}
