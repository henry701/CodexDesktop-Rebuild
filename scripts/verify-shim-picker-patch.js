#!/usr/bin/env node
/**
 * Verify patch-shim-model-picker.js was applied on extracted upstream ASAR.
 */
const fs = require("fs");
const path = require("path");
const { SRC_DIR } = require("./patch-util");

const PICKER_OK = /useHiddenModels:i\}\)\{let a=\[\],o=null,s=!1;/;
const SIDEBAR_OK = /listRecentThreads\(\{cursor:e,limit:t\}\).*modelProviders:\[\],archived:!1/;

function main() {
  const platform = process.argv[2] || "mac-x64";
  const dir = path.join(SRC_DIR, platform, "_asar", "webview", "assets");
  if (!fs.existsSync(dir)) {
    console.error("[fail] missing assets — run: npm run sync");
    process.exit(1);
  }

  const picker = fs
    .readdirSync(dir)
    .find((f) => /^models-and-reasoning-efforts-.*\.js$/.test(f));
  const signals = fs
    .readdirSync(dir)
    .find((f) => /^app-server-manager-signals-.*\.js$/.test(f));

  let ok = true;

  if (!picker) {
    console.error("[fail] models-and-reasoning-efforts-*.js not found");
    ok = false;
  } else {
    const text = fs.readFileSync(path.join(dir, picker), "utf8");
    if (PICKER_OK.test(text)) console.log(`[ok] picker: ${picker}`);
    else {
      console.error(`[fail] picker patch missing in ${picker}`);
      ok = false;
    }
  }

  if (!signals) {
    console.error("[fail] app-server-manager-signals-*.js not found");
    ok = false;
  } else {
    const text = fs.readFileSync(path.join(dir, signals), "utf8");
    if (SIDEBAR_OK.test(text)) console.log(`[ok] sidebar: ${signals}`);
    else {
      console.error(`[fail] sidebar listRecentThreads still filters providers in ${signals}`);
      ok = false;
    }
  }

  process.exit(ok ? 0 : 1);
}

main();
