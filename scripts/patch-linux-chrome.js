#!/usr/bin/env node
/**
 * Linux window chrome: integrated titlebar (win32-style overlay) + opaque surfaces.
 *
 * Upstream primary window on Linux uses titleBarStyle "default" (SSD) and skips
 * opaque backgroundColor that win32/darwin get — see-through on native Wayland.
 * M2/N2 gate shouldUseOpaqueWindowSurface() (sidebar backdrop); I2 alone is not enough.
 *
 * Usage:
 *   node scripts/patch-linux-chrome.js [platform]
 *   node scripts/patch-linux-chrome.js --check
 *   PATCH_ASAR_ROOT=/tmp/extracted node scripts/patch-linux-chrome.js
 */
const fs = require("fs");
const path = require("path");
const { locateBundles, relPath, parsePlatformArg } = require("./patch-util");

const REPLACEMENTS = [
  {
    id: "linux-primary-titlebar-overlay",
    from:
      "n===`win32`?{titleBarStyle:`hidden`,titleBarOverlay:b2(r)}:{titleBarStyle:`default`}",
    to:
      "n===`win32`||n===`linux`?{titleBarStyle:`hidden`,titleBarOverlay:b2(r)}:{titleBarStyle:`default`}",
  },
  {
    id: "linux-opaque-window-background",
    from:
      "function I2({platform:e,appearance:t,opaqueWindowsEnabled:n,prefersDarkColors:r}){return n&&!A2(t)&&(e===`darwin`||e===`win32`)?",
    to:
      "function I2({platform:e,appearance:t,opaqueWindowsEnabled:n,prefersDarkColors:r}){return n&&!A2(t)&&(e===`darwin`||e===`win32`||e===`linux`)?",
  },
  {
    id: "linux-opaque-surface-m2",
    from:
      "function M2({appearance:e,opaqueWindowsEnabled:t,platform:n}){return t&&!A2(e)&&(n===`darwin`||n===`win32`)}",
    to:
      "function M2({appearance:e,opaqueWindowsEnabled:t,platform:n}){return t&&!A2(e)&&(n===`darwin`||n===`win32`||n===`linux`)}",
  },
  {
    id: "linux-opaque-surface-n2",
    from:
      "function N2({appearance:e,isFocused:t,platform:n}){return!t&&!A2(e)&&(n===`darwin`||n===`win32`)}",
    to:
      "function N2({appearance:e,isFocused:t,platform:n}){return!t&&!A2(e)&&(n===`darwin`||n===`win32`||n===`linux`)}",
  },
  // 26.814+: primary overlay already includes linux; opaque helpers still omit it.
  {
    id: "linux-opaque-surface-mje",
    from:
      "opaqueWindowsEnabled:t,platform:n}){return t&&!A9(e)&&(n===`darwin`||n===`win32`)}",
    to:
      "opaqueWindowsEnabled:t,platform:n}){return t&&!A9(e)&&(n===`darwin`||n===`win32`||n===`linux`)}",
  },
  {
    id: "linux-opaque-surface-hje",
    from:
      "isFocused:t,platform:n}){return!t&&!A9(e)&&n===`darwin`}",
    to:
      "isFocused:t,platform:n}){return!t&&!A9(e)&&(n===`darwin`||n===`linux`)}",
  },
  // 26.901+: same opaque helpers, renamed L9.
  {
    id: "linux-opaque-surface-tre",
    from:
      "opaqueWindowsEnabled:t,platform:n}){return t&&!L9(e)&&(n===`darwin`||n===`win32`)}",
    to:
      "opaqueWindowsEnabled:t,platform:n}){return t&&!L9(e)&&(n===`darwin`||n===`win32`||n===`linux`)}",
  },
  {
    id: "linux-opaque-surface-ere",
    from:
      "isFocused:t,platform:n}){return!t&&!L9(e)&&n===`darwin`}",
    to:
      "isFocused:t,platform:n}){return!t&&!L9(e)&&(n===`darwin`||n===`linux`)}",
  },
];

function patchSource(source, { isCheck }) {
  let patched = source;
  const applied = [];

  for (const rule of REPLACEMENTS) {
    if (!patched.includes(rule.from)) {
      if (patched.includes(rule.to)) {
        applied.push({ ...rule, status: "already" });
      }
      continue;
    }
    if (isCheck) {
      applied.push({ ...rule, status: "would-apply" });
      continue;
    }
    patched = patched.replace(rule.from, rule.to);
    applied.push({ ...rule, status: "applied" });
  }

  return { patched, applied };
}

function patchFile(filePath, { isCheck }) {
  const source = fs.readFileSync(filePath, "utf8");
  const { patched, applied } = patchSource(source, { isCheck });

  if (applied.length === 0) {
    return { changed: false, applied };
  }

  const changed = patched !== source;
  if (changed && !isCheck) {
    fs.writeFileSync(filePath, patched, "utf8");
  }

  return { changed, applied };
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const platform = parsePlatformArg(args);
  const customRoot = process.env.PATCH_ASAR_ROOT;

  let bundles;
  if (customRoot) {
    const buildDir = path.join(customRoot, "src", ".vite", "build");
    const files = fs.existsSync(buildDir)
      ? fs.readdirSync(buildDir).filter((f) => /^main(-[^.]+)?\.js$/.test(f))
      : [];
    const target = files.find((f) => f !== "main.js") || files[0];
    if (!target) {
      console.error(`[x] No main bundle under ${buildDir}`);
      process.exit(1);
    }
    bundles = [{ platform: "installed", path: path.join(buildDir, target) }];
  } else {
    bundles = locateBundles({
      dir: "build",
      pattern: /^main(-[^.]+)?\.js$/,
      platform,
    });
  }

  if (bundles.length === 0) {
    console.error("[x] No main bundle found");
    process.exit(1);
  }

  let anyChange = false;
  for (const bundle of bundles) {
    console.log(`\n-- [${bundle.platform}] ${relPath(bundle.path)}`);
    const { changed, applied } = patchFile(bundle.path, { isCheck });

    for (const item of applied) {
      const label =
        item.status === "applied" ? "*" : item.status === "would-apply" ? "?" : "ok";
      console.log(`   ${label} [${item.id}] ${item.status}`);
    }

    if (applied.length === 0) {
      console.log("   [skip] no matching patterns (bundle layout changed?)");
    } else if (!changed && !isCheck) {
      console.log("   [ok] already patched");
    } else if (changed) {
      console.log(`   [ok] ${isCheck ? "would patch" : "patched"}`);
      anyChange = true;
    }
  }

  if (isCheck && anyChange) process.exit(2);
}

module.exports = { patchSource, REPLACEMENTS };

if (require.main === module) {
  main();
}
