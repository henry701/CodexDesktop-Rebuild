#!/usr/bin/env node
/**
 * Post-build patch: Nuke the OS menu bar on Linux while keeping in-app menus
 *
 * Three changes:
 *   1. removeMenu() → setMenu(null) — per-window menu removal (already exists
 *      upstream for win32; extends to all non-macOS via !==darwin guard).
 *   2. On Linux, store the built menu in globalThis.__cm instead of calling
 *      Menu.setApplicationMenu(st). The in-app menu bar uses
 *      Menu.getApplicationMenu() to look up menu items by ID and show them as
 *      popup submenus. Without setApplicationMenu(), getApplicationMenu()
 *      returns null, breaking in-app File/Edit/View dropdowns. So we still
 *      need the menu object accessible — just not as the OS-level application
 *      menu (which forces a GTK/KDE menu bar on Linux).
 *   3. Replace Menu.getApplicationMenu() with (globalThis.__cm ||
 *      Menu.getApplicationMenu()) so the IPC handler finds the stored menu
 *      on Linux (where setApplicationMenu was skipped) while falling back to
 *      the real application menu on macOS/Windows.
 *
 * Upstream Codex Desktop only calls removeMenu() on win32:
 *   process.platform===`win32`&&M.removeMenu()
 *
 * Usage:
 *   node scripts/patch-remove-menu.js [platform]    # Apply
 *   node scripts/patch-remove-menu.js --check       # Dry-run: report matches
 */
const fs = require("fs");
const { locateBundles, relPath } = require("./patch-util");

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const platform = args.find((a) => ["mac-arm64", "mac-x64", "win"].includes(a));

  const bundles = locateBundles({
    dir: "build",
    pattern: /^main(-[^.]+)?\.js$/,
    platform,
  });

  if (bundles.length === 0) {
    console.error("[x] No main bundle found");
    process.exit(1);
  }

  let totalReplacements = 0;

  for (const bundle of bundles) {
    console.log(`\n-- [${bundle.platform}] ${relPath(bundle.path)}`);
    let source = fs.readFileSync(bundle.path, "utf-8");
    let patched = source;
    const changes = [];

    // ── Rule 1: removeMenu() → setMenu(null) ──
    // Match: <var>.removeMenu() where var is a window variable
    const R1 = /([a-zA-Z_$]\w*)\.removeMenu\(\)/g;
    let m;
    while ((m = R1.exec(source)) !== null) {
      const expr = m[0];
      const varName = m[1];
      const idx = m.index;
      // Skip if already patched
      if (expr === "setMenu(null)") continue;
      changes.push({
        start: idx,
        end: idx + expr.length,
        replacement: `${varName}.setMenu(null)`,
        desc: `${expr} -> ${varName}.setMenu(null)`,
      });
    }

    // ── Rule 2: on Linux, skip setApplicationMenu, store menu instead ──
    // Match: <var>.Menu.setApplicationMenu(<arg>)
    // Pattern: <anything>Menu.setApplicationMenu(<arg>)
    const R2 = /([\w$]+)\.Menu\.setApplicationMenu\(([^)]+)\)/g;
    while ((m = R2.exec(source)) !== null) {
      const full = m[0];
      const moduleVar = m[1];
      const menuArg = m[2];
      const idx = m.index;
      // Already patched?
      const before = source.slice(Math.max(0, idx - 60), idx);
      if (before.includes("__cm")) continue;
      changes.push({
        start: idx,
        end: idx + full.length,
        replacement:
          `process.platform===\`linux\`?(globalThis.__cm=${menuArg}):${moduleVar}.Menu.setApplicationMenu(${menuArg})`,
        desc: `${full} -> linux-store/other-set`,
      });
    }

    // ── Rule 3: fallback to stored menu when getApplicationMenu returns null ──
    // Match: <var>.Menu.getApplicationMenu()
    // Wrap in (globalThis.__cm || <original>)
    const R3 = /([\w$]+)\.Menu\.getApplicationMenu\(\)/g;
    while ((m = R3.exec(source)) !== null) {
      const full = m[0];
      const moduleVar = m[1];
      const idx = m.index;
      // Already patched?
      const before = source.slice(Math.max(0, idx - 60), idx);
      if (before.includes("__cm")) continue;
      changes.push({
        start: idx,
        end: idx + full.length,
        replacement: `(globalThis.__cm||${full})`,
        desc: `${full} -> (globalThis.__cm||${full})`,
      });
    }

    if (changes.length === 0) {
      console.log("   [ok] Already patched or no match");
      continue;
    }

    if (isCheck) {
      console.log(`   [?] Matches: ${changes.length}`);
      for (const c of changes) {
        console.log(`     > offset ${c.start}: ${c.desc}`);
      }
      continue;
    }

    // Apply changes in reverse order to preserve offsets
    changes.sort((a, b) => b.start - a.start);
    for (const c of changes) {
      console.log(`   * ${c.desc}`);
      patched = patched.slice(0, c.start) + c.replacement + patched.slice(c.end);
    }

    fs.writeFileSync(bundle.path, patched, "utf-8");
    totalReplacements += changes.length;
    console.log(`   [ok] ${changes.length} changes applied`);
  }

  console.log(`\n== Total: ${totalReplacements} replacements ==`);
}

main();
