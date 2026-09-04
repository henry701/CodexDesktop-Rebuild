#!/usr/bin/env node
/**
 * patch-updater.js — Disable Sparkle, Windows, and Linux package auto-updaters
 *
 * AST match: in files that mention any shouldInclude*Updater method, replace
 * the method body so it returns false. Linux matters on this fork: the official
 * package updater would overwrite a locally patched install.
 *
 * Targets:
 *   shouldIncludeSparkle / WindowsUpdater / WindowsMsixUpdater
 *   shouldIncludeLinuxPackageUpdater / shouldIncludeUpdater
 *   → return !1
 */
const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");
const { locateBundles, relPath, SRC_DIR, parsePlatformArg, existingAsarPlatforms } = require("./patch-util");

const UPDATER_METHODS = new Set([
  "shouldIncludeSparkle",
  "shouldIncludeWindowsUpdater",
  "shouldIncludeWindowsMsixUpdater",
  "shouldIncludeLinuxPackageUpdater",
  "shouldIncludeUpdater",
]);

function walk(node, visitor) {
  if (!node || typeof node !== "object") return;
  if (node.type) visitor(node);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child)
        if (item && typeof item === "object" && item.type) walk(item, visitor);
    } else if (child && typeof child === "object" && child.type) {
      walk(child, visitor);
    }
  }
}

function collectPatches(ast, source) {
  const patches = [];

  walk(ast, (node) => {
    const keyName = node.key?.name || node.key?.value;
    if (!UPDATER_METHODS.has(keyName)) return;

    let fn = null;
    if (node.type === "Property" && node.value?.type === "FunctionExpression") {
      fn = node.value;
    } else if (node.type === "MethodDefinition" && node.value?.type === "FunctionExpression") {
      fn = node.value;
    }
    if (!fn) return;
    const body = fn.body;
    if (!body || body.type !== "BlockStatement") return;
    if (body.body.length !== 1) return;
    const ret = body.body[0];
    if (ret.type !== "ReturnStatement" || !ret.argument) return;

    const retSrc = source.slice(ret.argument.start, ret.argument.end);
    if (retSrc === "!1") return;

    patches.push({
      id: keyName,
      start: ret.argument.start,
      end: ret.argument.end,
      replacement: "!1",
      original: retSrc.length > 50 ? retSrc.slice(0, 47) + "..." : retSrc,
    });
  });

  return patches;
}

function locateTargets(platform) {
  const platforms = platform
    ? [platform]
    : existingAsarPlatforms().filter((p) =>
        fs.existsSync(path.join(SRC_DIR, p, "_asar", ".vite", "build")),
      );

  const targets = [];
  for (const plat of platforms) {
    const buildDir = path.join(SRC_DIR, plat, "_asar", ".vite", "build");
    if (!fs.existsSync(buildDir)) continue;
    for (const f of fs.readdirSync(buildDir)) {
      if (!f.endsWith(".js")) continue;
      const fp = path.join(buildDir, f);
      const src = fs.readFileSync(fp, "utf-8");
      if (
        src.includes("shouldIncludeSparkle") ||
        src.includes("shouldIncludeUpdater") ||
        src.includes("shouldIncludeWindowsUpdater") ||
        src.includes("shouldIncludeLinuxPackageUpdater")
      ) {
        targets.push({ platform: plat, path: fp });
      }
    }
  }
  return targets;
}

function main() {
  const args = process.argv.slice(2);
  const platform = parsePlatformArg(args);

  const targets = locateTargets(platform);
  if (targets.length === 0) {
    console.log("  [ok] No updater targets found");
    return;
  }

  for (const bundle of targets) {
    console.log(`  [${bundle.platform}] ${relPath(bundle.path)}`);
    const source = fs.readFileSync(bundle.path, "utf-8");
    const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
    const patches = collectPatches(ast, source);

    if (patches.length === 0) {
      console.log("    [ok] Already patched or no match");
      continue;
    }

    patches.sort((a, b) => b.start - a.start);
    let code = source;
    for (const p of patches) {
      console.log(`    * [${p.id}] ${p.original} -> !1`);
      code = code.slice(0, p.start) + p.replacement + code.slice(p.end);
    }

    fs.writeFileSync(bundle.path, code, "utf-8");
    console.log(`    [ok] ${patches.length} updater methods disabled`);
  }
}

module.exports = { collectPatches, UPDATER_METHODS };

if (require.main === module) {
  main();
}
