#!/usr/bin/env node
/**
 * Run all patch scripts in sequence.
 *
 * Usage:
 *   node scripts/patch-all.js mac-x64              # Linux-oriented: patch mac-x64 upstream ASAR
 *   node scripts/patch-all.js --check              # Dry-run all
 *   USE_COMETIX_CODEX=1 node scripts/patch-all.js mac-x64   # also apply archive-delete UI patch
 *
 * patch-archive-delete.js runs only when USE_COMETIX_CODEX=1 (needs Cometix CLI thread/delete).
 */
const { execFileSync } = require("child_process");
const path = require("path");
const {
  isCometixCodexEnabled,
  cometixCodexPassThroughArgs,
} = require("./build-flags");

const BASE_PATCHES = [
  "patch-i18n.js",
  "patch-copyright.js",
  "patch-devtools.js",
  "patch-fast-mode.js",
  "patch-plugin-auth.js",
  "patch-updater.js",
];

const COMETIX_PATCHES = ["patch-archive-delete.js"];

function main() {
  const args = process.argv.slice(2);
  const platform = args.find((a) => ["mac-arm64", "mac-x64", "win", "unix"].includes(a));
  const useCometixCodex = isCometixCodexEnabled(args);
  const extra = args.filter((a) => a.startsWith("--") && a !== "--use-cometix-codex");
  const passArgs = [
    ...(platform ? [platform] : []),
    ...cometixCodexPassThroughArgs(useCometixCodex),
    ...extra,
  ];

  const patches = useCometixCodex
    ? [...BASE_PATCHES, ...COMETIX_PATCHES]
    : BASE_PATCHES;

  console.log(`USE_COMETIX_CODEX: ${useCometixCodex ? "yes" : "no"}`);
  if (!useCometixCodex) {
    console.log("  (skipping patch-archive-delete.js — requires Cometix CLI)");
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
