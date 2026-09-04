#!/usr/bin/env node
/**
 * Linux Wayland keyboard input fixes for Codex Desktop.
 *
 * Symptoms: menu keys work, mouse/paste work, physical keyboard dead in web fields.
 * Root cause (26.623+): avatar-overlay / native-pet child BrowserWindows steal Wayland
 * text-input (26.602.x has no pet overlay). Not in default patch-all.js — pets stay
 * enabled; this file only opts into keyboard-focus guards, never hides the pet.
 *
 * Usage:
 *   node scripts/patch-linux-wayland-keyboard.js [platform]
 *   node scripts/patch-linux-wayland-keyboard.js --check
 *   PATCH_ASAR_ROOT=/tmp/extracted node scripts/patch-linux-wayland-keyboard.js
 */
const fs = require("fs");
const path = require("path");
const { locateBundles, relPath, parsePlatformArg } = require("./patch-util");

const REPLACEMENTS = [
  {
    id: "revert-primary-window-double-focus",
    from:
      "let te=()=>{this.applyWindowBackdrop(M,c,!1),this.sendMessageToWindow(M,{type:`electron-window-focus-changed`,isFocused:M.isFocused()}),process.platform===`linux`&&M.isFocused()&&!N.isDestroyed()&&N.focus()}",
    to:
      "let te=()=>{this.applyWindowBackdrop(M,c,!1),this.sendMessageToWindow(M,{type:`electron-window-focus-changed`,isFocused:M.isFocused()})}",
  },
  {
    id: "pet-onBeforeSurfaceFocus-steal",
    from: "onBeforeSurfaceFocus:()=>{a.app.focus({steal:!0})}",
    to: "onBeforeSurfaceFocus:()=>{process.platform!==`linux`&&a.app.focus({steal:!0})}",
  },
  {
    id: "pet-overlay-keyboard-te",
    from:
      "function te(e){if(e==null||!e.visible||!e.attached||e.preparation.id!==S)return;e.window.show(),e.window.setFocusable(!0),e.window.setIgnoreMouseEvents(!1),e.keyboardInteractive=!0",
    to:
      "function te(e){if(process.platform===`linux`||e==null||!e.visible||!e.attached||e.preparation.id!==S)return;e.window.show(),e.window.setFocusable(!0),e.window.setIgnoreMouseEvents(!1),e.keyboardInteractive=!0",
  },
  {
    id: "pet-overlay-setFocusable-loop",
    from:
      "e.keyboardInteractive?(e.window.setFocusable(!0),e.window.setIgnoreMouseEvents(!1))",
    to:
      "e.keyboardInteractive&&process.platform!==`linux`?(e.window.setFocusable(!0),e.window.setIgnoreMouseEvents(!1))",
  },
  {
    id: "pet-setKeyboardInteraction-focus",
    from:
      "setKeyboardInteraction(e,t){let n=this.window;if(!(n==null||n.isDestroyed()||n.webContents.id!==e)){if(this.applyPointerInteractivityPolicy(),!t){n.setFocusable(!1);return}n.setFocusable(!0),n.show(),process.platform===`darwin`&&a.app.focus({steal:!0}),n.focus(),n.webContents.focus(),this.windowManager.sendMessageToWebContents(n.webContents,{type:`avatar-overlay-keyboard-interaction-ready`})}}",
    to:
      "setKeyboardInteraction(e,t){let n=this.window;if(!(n==null||n.isDestroyed()||n.webContents.id!==e)){if(this.applyPointerInteractivityPolicy(),!t){n.setFocusable(!1);return}if(process.platform===`linux`)return;n.setFocusable(!0),n.show(),process.platform===`darwin`&&a.app.focus({steal:!0}),n.focus(),n.webContents.focus(),this.windowManager.sendMessageToWebContents(n.webContents,{type:`avatar-overlay-keyboard-interaction-ready`})}}",
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
        item.status === "applied"
          ? "*"
          : item.status === "would-apply"
            ? "?"
            : "ok";
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

main();
