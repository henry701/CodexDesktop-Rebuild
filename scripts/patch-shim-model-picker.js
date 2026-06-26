#!/usr/bin/env node
/**
 * Post-build patch: expose codex-shim custom models in Desktop picker.
 *
 *   26.623+: shared webpack chunks (Zc / $l call sites)
 *
 * Base pagination lives in patch-model-list-pagination.js (always applied).
 * This script adds shim-only allowlist + sidebar patches when USE_SHIM_MODEL_PICKER=1.
 *
 * @see https://github.com/henry701/codex-shim
 */
const fs = require("fs");
const path = require("path");
const { relPath, SRC_DIR } = require("./patch-util");

const PICKER_NEEDLE =
  "useHiddenModels:o}){let s=[],c=null,l=o&&e!==`amazonBedrock`,";
const PICKER_REPLACEMENT =
  "useHiddenModels:o}){let s=[],c=null,l=!1,";

const SIDEBAR_NEEDLE =
  "listRecentThreads({cursor:e,limit:t,useStateDbOnly:n=!1}){let r={limit:t,cursor:e,sortKey:this.params.requestClient.getCompatibleThreadSortKey(this.recentConversationSortKey),modelProviders:null,archived:!1,sourceKinds:P,useStateDbOnly:n};return this.params.requestClient.sendRequ";
const SIDEBAR_REPLACEMENT =
  "listRecentThreads({cursor:e,limit:t,useStateDbOnly:n=!1}){let r={limit:t,cursor:e,sortKey:this.params.requestClient.getCompatibleThreadSortKey(this.recentConversationSortKey),modelProviders:[],archived:!1,sourceKinds:P,useStateDbOnly:n};return this.params.requestClient.sendRequ";

function assetsDir(platform) {
  return path.join(SRC_DIR, platform, "_asar", "webview", "assets");
}

function findAssetFilesByNeedle(dir, needle) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(dir, f))
    .filter((filePath) => fs.readFileSync(filePath, "utf8").includes(needle));
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

function patchNeedleInDir(dir, patchId, needle, replacement, dryRun, { required = false } = {}) {
  const files = findAssetFilesByNeedle(dir, needle);
  if (files.length === 0) {
    const already = findAssetFilesByNeedle(dir, replacement);
    if (already.length > 0) {
      for (const filePath of already) {
        console.log(`  [ok] ${relPath(filePath)}: ${patchId} already applied`);
      }
      return true;
    }
    console.log(`  ${required ? "[!]" : "[skip]"} ${patchId}: no bundle contains needle`);
    return !required;
  }
  if (files.length > 1) {
    console.log(`  [!] ${patchId}: needle matched ${files.length} bundles`);
    return false;
  }
  return patchFile(files[0], patchId, needle, replacement, dryRun, { required });
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

  if (
    !patchNeedleInDir(dir, "model-picker-allowlist", PICKER_NEEDLE, PICKER_REPLACEMENT, dryRun, {
      required: true,
    })
  ) {
    ok = false;
  }

  if (
    !patchNeedleInDir(dir, "sidebar-provider-filter", SIDEBAR_NEEDLE, SIDEBAR_REPLACEMENT, dryRun)
  ) {
    ok = false;
  }

  if (!ok) process.exit(1);
}

main();
