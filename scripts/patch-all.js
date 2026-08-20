#!/usr/bin/env node
/**
 * Run all patch scripts in sequence.
 *
 * Usage:
 *   node scripts/patch-all.js linux-x64           # Official Linux ChatGPT ASAR
 *   node scripts/patch-all.js mac-x64              # macOS upstream ASAR
 *   node scripts/patch-all.js --check              # Dry-run all
 *   USE_COMETIX_CODEX=1 node scripts/patch-all.js linux-x64
 *   USE_SHIM_MODEL_PICKER=1 node scripts/patch-all.js linux-x64
 *
 * patch-archive-delete.js runs only when USE_COMETIX_CODEX=1 (needs Cometix CLI thread/delete).
 * patch-shim-model-picker.js runs only when USE_SHIM_MODEL_PICKER=1.
 */
const { execFileSync } = require("child_process");
const path = require("path");
const {
  isCometixCodexEnabled,
  isShimModelPickerEnabled,
  cometixCodexPassThroughArgs,
  shimModelPickerPassThroughArgs,
} = require("./build-flags");
const { parsePlatformArg } = require("./patch-util");

const BASE_PATCHES = [
  "patch-i18n.js",
  "patch-copyright.js",
  "patch-devtools.js",
  "patch-remove-menu.js",
  "patch-linux-chrome.js",
  "patch-model-list-pagination.js",
  "patch-fast-mode.js",
  "patch-plugin-auth.js",
  "patch-updater.js",
];

const COMETIX_PATCHES = ["patch-archive-delete.js"];
const SHIM_MODEL_PICKER_PATCHES = ["patch-shim-model-picker.js"];

function main() {
  const args = process.argv.slice(2);
  const platform = parsePlatformArg(args);
  const useCometixCodex = isCometixCodexEnabled(args);
  const useShimModelPicker = isShimModelPickerEnabled(args);
  const extra = args.filter(
    (a) =>
      a.startsWith("--") &&
      a !== "--use-cometix-codex" &&
      a !== "--shim-model-picker",
  );
  const passArgs = [
    ...(platform ? [platform] : []),
    ...cometixCodexPassThroughArgs(useCometixCodex),
    ...shimModelPickerPassThroughArgs(useShimModelPicker),
    ...extra,
  ];

  const patches = [
    ...BASE_PATCHES,
    ...(useCometixCodex ? COMETIX_PATCHES : []),
    ...(useShimModelPicker ? SHIM_MODEL_PICKER_PATCHES : []),
  ];

  console.log(`USE_COMETIX_CODEX: ${useCometixCodex ? "yes" : "no"}`);
  console.log(`USE_SHIM_MODEL_PICKER: ${useShimModelPicker ? "yes" : "no"}`);
  if (!useCometixCodex) {
    console.log("  (skipping patch-archive-delete.js — requires Cometix CLI)");
  }
  if (!useShimModelPicker) {
    console.log("  (skipping patch-shim-model-picker.js — opt in: USE_SHIM_MODEL_PICKER=1)");
  }

  let failed = 0;

  for (const script of patches) {
    const scriptPath = path.join(__dirname, script);
    const label = script.replace(".js", "");
    console.log(`\n== ${label} ==`);

    try {
      execFileSync("node", [scriptPath, ...passArgs], { stdio: "inherit", env: process.env });
    } catch (e) {
      console.error(`[x] ${label} failed (exit ${e.status})`);
      failed++;
    }
  }

  console.log(`\n== Summary: ${patches.length - failed}/${patches.length} succeeded ==`);
  if (failed > 0) process.exit(1);
}

main();
