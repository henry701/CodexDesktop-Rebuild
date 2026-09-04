#!/usr/bin/env node
/**
 * Model picker layout: taller scroller and real row padding on Electron.
 *
 * Upstream's `--menu-item-height` / `--menu-item-padding` tokens live only on
 * `[data-codex-window-type=browser]`. Electron falls back to `0px` min-height
 * and `--padding-row-y` (~4–5px), so BYOK catalogs look like a wall of text.
 */
const fs = require("fs");
const path = require("path");
const { relPath, SRC_DIR, parsePlatformArg, existingAsarPlatforms } = require("./patch-util");

const SHORT_SCROLL =
  "vertical-scroll-fade-mask flex max-h-[250px] flex-col overflow-y-auto";
const TALL_SCROLL =
  "vertical-scroll-fade-mask flex max-h-[480px] flex-col overflow-y-auto";

const ELECTRON_TOKENS_FROM =
  "[data-codex-window-type=electron]{--text-sm:13px;--text-xs:12px;--font-weight-medium:500;background:0 0;overflow:hidden}";
const ELECTRON_TOKENS_TO =
  "[data-codex-window-type=electron]{--text-sm:13px;--text-xs:12px;--font-weight-medium:500;background:0 0;overflow:hidden;--menu-item-padding:calc(var(--spacing) * 2) calc(var(--spacing) * 2.5);--menu-item-height:calc(var(--spacing) * 9)}";

const REPLACEMENTS = [
  { from: SHORT_SCROLL, to: TALL_SCROLL },
  {
    from: "min-h-[var(--menu-item-height,0px)]",
    to: "min-h-[var(--menu-item-height,2.25rem)]",
  },
  {
    from: "min-height:var(--menu-item-height,0px)",
    to: "min-height:var(--menu-item-height,2.25rem)",
  },
  { from: ELECTRON_TOKENS_FROM, to: ELECTRON_TOKENS_TO },
];

function patchInSource(source) {
  let next = source;
  let changed = false;
  let anyNeedle = false;
  for (const { from, to } of REPLACEMENTS) {
    if (next.includes(to)) anyNeedle = true;
    if (!next.includes(from)) continue;
    anyNeedle = true;
    next = next.split(from).join(to);
    changed = true;
  }
  if (changed) return { source: next, status: "patched" };
  if (anyNeedle) return { source: next, status: "already" };
  return { source, status: "missing" };
}

function assetsDir(platform, customRoot) {
  if (customRoot) {
    return path.join(customRoot, "src", "webview", "assets");
  }
  return path.join(SRC_DIR, platform, "_asar", "webview", "assets");
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--check");
  const platform = parsePlatformArg(args) || existingAsarPlatforms()[0] || "linux-x64";
  const dir = assetsDir(platform, process.env.PATCH_ASAR_ROOT);
  if (!fs.existsSync(dir)) {
    console.error(`  [!] assets dir missing: ${dir} — run npm run sync first`);
    process.exit(1);
  }

  let hit = false;
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".js") || f.endsWith(".css"))) {
    const filePath = path.join(dir, name);
    const source = fs.readFileSync(filePath, "utf8");
    const result = patchInSource(source);
    if (result.status === "missing") continue;
    hit = true;
    if (result.status === "already") {
      console.log(`  [ok] ${relPath(filePath)}: model-picker-layout already applied`);
      continue;
    }
    if (dryRun) {
      console.log(`  [?] ${relPath(filePath)}: would patch (model-picker-layout)`);
      continue;
    }
    fs.writeFileSync(filePath, result.source, "utf8");
    console.log(`  [ok] ${relPath(filePath)}: patched (model-picker-layout)`);
  }
  if (!hit) {
    console.error("[x] model-picker-layout: no matching scroller/item tokens");
    process.exit(1);
  }
}

module.exports = { SHORT_SCROLL, TALL_SCROLL, patchInSource };

if (require.main === module) {
  main();
}
