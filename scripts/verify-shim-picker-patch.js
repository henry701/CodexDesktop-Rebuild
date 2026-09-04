#!/usr/bin/env node
/**
 * Verify patch-shim-model-picker.js was applied on extracted upstream ASAR.
 */
const fs = require("fs");
const path = require("path");
const { SRC_DIR } = require("./patch-util");

const PICKER_OK =
  /useHiddenModels:\w\}\)\{let \w+=\[\],\w+=null,\w+=!1,|!1\?n\.has\(i\.model\):!i\.hidden|!1\?n\.has\(a\.model\):!a\.hidden/;
const PAGINATION_OK =
  /queryFn:\(\)=>\w+\(`list-models-for-host`,\{hostId:\w+,includeHidden:!0,cursor:null,limit:1e4\}\)|sendRequest\(`model\/list`,\{includeHidden:!0,cursor:null,limit:1e4\}\)/;
const LOOKUP_PAGINATION_OK =
  /let\{data:\w+\}=await \$?\w+\(`list-models-for-host`,\{hostId:\w+,includeHidden:!0,cursor:null,limit:1e4(?:,priority:`critical`)?\}|sendRequest\(`model\/list`,\{includeHidden:!0,cursor:null,limit:1e4\}/;
const PICKER_HEIGHT_OK =
  /vertical-scroll-fade-mask flex max-h-\[480px\] flex-col overflow-y-auto/;
const MENU_ITEM_PAD_OK =
  /--menu-item-height:calc\(var\(--spacing\) \* 9\)|min-h-\[var\(--menu-item-height,2\.25rem\)\]/;
const SIDEBAR_OK =
  /listRecentThreads\(\{cursor:\w+,limit:\w+,useStateDbOnly:\w+=!1(?:,background:\w+=!1)?\}\)\{let \w+=\{[^}]*modelProviders:\[\],archived:!1|getCompatibleThreadSortKey\(this\.recentConversationSortKey\),modelProviders:\[\],archived:!1/;

function assetsDir(platform) {
  return path.join(SRC_DIR, platform, "_asar", "webview", "assets");
}

function findFilesMatching(dir, pattern) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js") || f.endsWith(".css"))
    .map((f) => path.join(dir, f))
    .filter((filePath) => pattern.test(fs.readFileSync(filePath, "utf8")));
}

function check(label, files, pattern) {
  if (files.length === 0) {
    console.error(`[fail] ${label}: no matching bundle`);
    return false;
  }
  const name = path.basename(files[0]);
  console.log(`[ok] ${label}: ${name}`);
  return true;
}

function main() {
  const platform = process.argv[2] || "linux-x64";
  const dir = assetsDir(platform);
  if (!fs.existsSync(dir)) {
    console.error("[fail] missing assets — run: npm run sync");
    process.exit(1);
  }

  let ok = true;

  const picker = findFilesMatching(dir, PICKER_OK);
  if (!check("picker allowlist", picker, PICKER_OK)) ok = false;

  const pagination = findFilesMatching(dir, PAGINATION_OK);
  if (!check("model list pagination", pagination, PAGINATION_OK)) ok = false;

  const lookup = findFilesMatching(dir, LOOKUP_PAGINATION_OK);
  if (!check("model lookup pagination", lookup, LOOKUP_PAGINATION_OK)) ok = false;

  const height = findFilesMatching(dir, PICKER_HEIGHT_OK);
  if (!check("model picker height", height, PICKER_HEIGHT_OK)) ok = false;

  const pad = findFilesMatching(dir, MENU_ITEM_PAD_OK);
  if (!check("model picker row padding", pad, MENU_ITEM_PAD_OK)) ok = false;

  const sidebar = findFilesMatching(dir, SIDEBAR_OK);
  if (sidebar.length > 0) {
    console.log(`[ok] sidebar: ${path.basename(sidebar[0])}`);
  } else {
    const fallback = findFilesMatching(
      dir,
      /listRecentThreads\(\{cursor:\w+,limit:\w+\}\).*modelProviders:\[\],archived:!1/,
    );
    if (fallback.length > 0) {
      console.log(`[ok] sidebar (legacy): ${path.basename(fallback[0])}`);
    } else {
      console.log("[skip] sidebar: upstream may already omit provider filter");
    }
  }

  process.exit(ok ? 0 : 1);
}

main();
