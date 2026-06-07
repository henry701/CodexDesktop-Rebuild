#!/usr/bin/env node
/**
 * Post-build patch: expose codex-shim custom models in Desktop picker.
 *
 * Upstream moved the allowlist gate from model-queries-*.js to
 * models-and-reasoning-efforts-*.js (26.601+). Sidebar listRecentThreads may
 * already ship with modelProviders:[] — that patch is applied when still null.
 *
 * @see https://github.com/henry701/codex-shim
 */
const fs = require("fs");
const path = require("path");
const { relPath, SRC_DIR } = require("./patch-util");

const PICKER_NEEDLE =
  "useHiddenModels:i}){let a=[],o=null,s=i&&e!==`amazonBedrock`;";
const PICKER_REPLACEMENT =
  "useHiddenModels:i}){let a=[],o=null,s=!1;";

const SIDEBAR_NEEDLE =
  "listRecentThreads({cursor:e,limit:t}){return this.params.requestClient.sendRequest(`thread/list`,{limit:t,cursor:e,sortKey:this.recentConversationSortKey,modelProviders:null,archived:!1,sourceKinds:";
const SIDEBAR_REPLACEMENT =
  "listRecentThreads({cursor:e,limit:t}){return this.params.requestClient.sendRequest(`thread/list`,{limit:t,cursor:e,sortKey:this.recentConversationSortKey,modelProviders:[],archived:!1,sourceKinds:";

function assetsDir(platform) {
  return path.join(SRC_DIR, platform, "_asar", "webview", "assets");
}

function findAssetFile(dir, pattern) {
  if (!fs.existsSync(dir)) return null;
  const name = fs.readdirSync(dir).find((f) => pattern.test(f));
  return name ? path.join(dir, name) : null;
}

function replaceOnce(source, needle, replacement) {
  if (source.includes(replacement)) return { source, changed: false, status: "already" };
  const count = source.split(needle).length - 1;
  if (count === 0) return { source, changed: false, status: "missing" };
  if (count !== 1) return { source, changed: false, status: "ambiguous" };
  return { source: source.replace(needle, replacement), changed: true, status: "patched" };
}

function patchFile(bundlePath, patchId, needle, replacement, dryRun, { required = false } = {}) {
  const source = fs.readFileSync(bundlePath, "utf8");
  const result = replaceOnce(source, needle, replacement);
  if (result.status === "missing") {
    const label = required ? "[!]" : "[skip]";
    console.log(`  ${label} ${relPath(bundlePath)}: ${patchId} needle not found`);
    return !required;
  }
  if (result.status === "ambiguous") {
    console.log(`  [!] ${relPath(bundlePath)}: ${patchId} needle matched more than once`);
    return false;
  }
  if (result.status === "already") {
    console.log(`  [ok] ${relPath(bundlePath)}: ${patchId} already applied`);
    return true;
  }
  if (dryRun) {
    console.log(`  [?] ${relPath(bundlePath)}: would patch (${patchId})`);
    return true;
  }
  fs.writeFileSync(bundlePath, result.source, "utf8");
  console.log(`  [ok] ${relPath(bundlePath)}: patched (${patchId})`);
  return true;
}

function patchSidebarPrefix(dir, dryRun) {
  const bundlePath = findAssetFile(dir, /^app-server-manager-signals-.*\.js$/);
  if (!bundlePath) {
    console.log("  [skip] app-server-manager-signals-*.js not found");
    return true;
  }
  const source = fs.readFileSync(bundlePath, "utf8");
  const idx = source.indexOf(SIDEBAR_NEEDLE);
  if (idx === -1) {
    if (source.includes("listRecentThreads") && source.includes("modelProviders:[],")) {
      console.log(`  [ok] ${relPath(bundlePath)}: sidebar already uses modelProviders:[]`);
      return true;
    }
    console.log(`  [skip] ${relPath(bundlePath)}: sidebar listRecentThreads needle not found`);
    return true;
  }
  const tailIdx = source.indexOf("})", idx + SIDEBAR_NEEDLE.length);
  if (tailIdx === -1) {
    console.log(`  [!] ${relPath(bundlePath)}: could not close sidebar needle`);
    return false;
  }
  const needle = source.slice(idx, tailIdx + 1);
  const replacement = needle.replace("modelProviders:null", "modelProviders:[]");
  return patchFile(bundlePath, "sidebar-provider-filter", needle, replacement, dryRun);
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--check");
  const platform = args.find((a) => ["mac-arm64", "mac-x64", "win"].includes(a)) || "mac-x64";
  const dir = assetsDir(platform);

  if (!fs.existsSync(dir)) {
    console.error(`  [!] assets dir missing: ${dir} — run npm run sync first`);
    process.exit(1);
  }

  let ok = true;

  const pickerPath = findAssetFile(dir, /^models-and-reasoning-efforts-.*\.js$/);
  if (!pickerPath) {
    console.log("  [!] models-and-reasoning-efforts-*.js not found");
    ok = false;
  } else if (
    !patchFile(
      pickerPath,
      "model-picker-allowlist",
      PICKER_NEEDLE,
      PICKER_REPLACEMENT,
      dryRun,
      { required: true },
    )
  ) {
    ok = false;
  }

  if (!patchSidebarPrefix(dir, dryRun)) ok = false;

  if (!ok) process.exit(1);
}

main();
