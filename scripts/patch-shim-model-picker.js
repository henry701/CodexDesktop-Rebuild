#!/usr/bin/env node
/**
 * Post-build patch: expose codex-shim custom models in Desktop picker.
 *
 * Base pagination lives in patch-model-list-pagination.js (always applied).
 * This script adds shim-only allowlist + sidebar patches when USE_SHIM_MODEL_PICKER=1.
 *
 * Patterns tolerate minifier renames across upstream drops.
 *
 * @see https://github.com/henry701/codex-shim
 */
const fs = require("fs");
const path = require("path");
const { relPath, SRC_DIR } = require("./patch-util");

const ID = "[$A-Za-z_][\\w$]*";

/** Hide non-allowlisted providers unless amazonBedrock exception — force off. */
const PICKER_RE = new RegExp(
  String.raw`(useHiddenModels:(${ID})\}\)\{let ${ID}=\[\],${ID}=null,)(${ID})=\2&&\w+!==\`amazonBedrock\`,`,
);
const PICKER_ALREADY = /useHiddenModels:\w\}\)\{let \w+=\[\],\w+=null,\w+=!1,/;

/**
 * Sidebar recent-threads filter: modelProviders:null → [] so shim threads show.
 * Optional background arg (26.707+) and any sourceKinds identifier.
 */
const SIDEBAR_RE = new RegExp(
  String.raw`(listRecentThreads\(\{cursor:${ID},limit:${ID},useStateDbOnly:${ID}=!1(?:,background:${ID}=!1)?\}\)\{let ${ID}=\{limit:${ID},cursor:${ID},sortKey:this\.params\.requestClient\.getCompatibleThreadSortKey\(this\.recentConversationSortKey\),)modelProviders:null,(archived:!1,sourceKinds:${ID},useStateDbOnly:${ID})`,
);
const SIDEBAR_ALREADY =
  /listRecentThreads\(\{cursor:\w+,limit:\w+,useStateDbOnly:\w+=!1(?:,background:\w+=!1)?\}\)\{let \w+=\{[^}]*modelProviders:\[\],archived:!1/;

function assetsDir(platform, customRoot) {
  if (customRoot) {
    return path.join(customRoot, "src", "webview", "assets");
  }
  return path.join(SRC_DIR, platform, "_asar", "webview", "assets");
}

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(dir, f));
}

function replaceOnceRegex(source, re, buildReplacement, alreadyRe) {
  if (alreadyRe.test(source)) return { source, status: "already" };
  const matches = [...source.matchAll(new RegExp(re.source, "g"))];
  if (matches.length === 0) return { source, status: "missing" };
  if (matches.length > 1) return { source, status: "ambiguous", count: matches.length };
  const m = matches[0];
  const replacement = buildReplacement(m);
  return {
    source: source.slice(0, m.index) + replacement + source.slice(m.index + m[0].length),
    status: "patched",
  };
}

function patchPicker(source) {
  return replaceOnceRegex(
    source,
    PICKER_RE,
    (m) => `${m[1]}${m[3]}=!1,`,
    PICKER_ALREADY,
  );
}

function patchSidebar(source) {
  return replaceOnceRegex(
    source,
    SIDEBAR_RE,
    (m) => `${m[1]}modelProviders:[],${m[2]}`,
    SIDEBAR_ALREADY,
  );
}

function applyInDir(dir, patchId, patchFn, dryRun, { required = false } = {}) {
  let found = false;
  for (const filePath of listJsFiles(dir)) {
    const source = fs.readFileSync(filePath, "utf8");
    const result = patchFn(source);
    if (result.status === "missing") continue;
    found = true;
    if (result.status === "ambiguous") {
      console.log(`  [!] ${relPath(filePath)}: ${patchId} matched ${result.count} times`);
      return false;
    }
    if (result.status === "already") {
      console.log(`  [ok] ${relPath(filePath)}: ${patchId} already applied`);
      return true;
    }
    if (dryRun) {
      console.log(`  [?] ${relPath(filePath)}: would patch (${patchId})`);
      return true;
    }
    fs.writeFileSync(filePath, result.source, "utf8");
    console.log(`  [ok] ${relPath(filePath)}: patched (${patchId})`);
    return true;
  }
  if (!found) {
    console.log(`  ${required ? "[!]" : "[skip]"} ${patchId}: no bundle contains needle`);
    return !required;
  }
  return true;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--check");
  const platform = args.find((a) => ["mac-arm64", "mac-x64", "win"].includes(a)) || "mac-x64";
  const dir = assetsDir(platform, process.env.PATCH_ASAR_ROOT);

  if (!fs.existsSync(dir)) {
    console.error(`  [!] assets dir missing: ${dir} — run npm run sync first`);
    process.exit(1);
  }

  let ok = true;
  if (!applyInDir(dir, "model-picker-allowlist", patchPicker, dryRun, { required: true })) {
    ok = false;
  }
  if (!applyInDir(dir, "sidebar-provider-filter", patchSidebar, dryRun, { required: false })) {
    ok = false;
  }
  if (!ok) process.exit(1);
}

main();
