#!/usr/bin/env node
/**
 * Pre-build: Repack patched ASAR, resolve Linux CLI binaries, assemble for forge.
 *
 * Linux CLI resolution (first match wins):
 *   1. USE_COMETIX_CODEX=1  — @cometix/codex prebuilt binaries
 *   2. USE_SYSTEM_CLI       — host PATH (default on for linux-* platforms)
 *   3. (else)               — macOS upstream bundled binaries (non-functional on Linux)
 *
 * Usage:
 *   node scripts/prepare-src.js --platform linux-x64
 *   USE_SYSTEM_CLI=0 node scripts/prepare-src.js --platform linux-x64
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const {
  isCometixCodexEnabled,
  isSystemCliEnabled,
  logCometixCodexSkipped,
  warnLinuxUpstreamCli,
} = require("./build-flags");
const { resolveCodexVendor, resolveRgVendor } = require("./cometix-vendor");
const { installSystemCli } = require("./system-cli");
const { installCodeModeHost } = require("./code-mode-host");

const SRC = path.join(__dirname, "..", "src");
const PROJECT_ROOT = path.join(__dirname, "..");

function copyRecursive(src, dest, skipFiles, skipDirs) {
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skipDirs?.has(e.name)) continue;
    if (skipFiles?.has(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) { count += copyRecursive(s, d, skipFiles, skipDirs); }
    else if (e.isSymbolicLink()) { /* skip */ }
    else { fs.copyFileSync(s, d); count++; }
  }
  return count;
}

/**
 * @param {string} platform
 * @param {string} sourceDir
 * @param {boolean} useCometixCodex
 * @param {boolean} useSystemCli
 */
function applyBundledCli(platform, sourceDir, useCometixCodex, useSystemCli) {
  const isLinux = platform.startsWith("linux");
  const isWin = platform === "win";
  const codexBinName = isWin ? "codex.exe" : "codex";

  if (useCometixCodex) {
    const vendorCodex = resolveCodexVendor(platform);
    if (vendorCodex) {
      const dest = path.join(sourceDir, codexBinName);
      fs.copyFileSync(vendorCodex, dest);
      try { fs.chmodSync(dest, 0o755); } catch {}
      console.log("   [codex] replaced with @cometix/codex");
    } else {
      console.log(`   [!] @cometix/codex vendor not found for ${platform}, keeping upstream`);
    }

    if (isLinux) {
      const vendorRg = resolveRgVendor(platform);
      if (vendorRg) {
        const dest = path.join(sourceDir, "rg");
        fs.copyFileSync(vendorRg, dest);
        try { fs.chmodSync(dest, 0o755); } catch {}
        console.log("   [rg] replaced with Linux rg from @cometix/codex");
      } else {
        console.log("   [!] Linux rg not found in vendor, keeping upstream (will fail on Linux)");
      }
      installLinuxCodeModeHost(sourceDir, platform);
    }
    return;
  }

  if (isLinux && useSystemCli) {
    const result = installSystemCli(sourceDir);
    if (!result.ok) {
      console.error(`[x] USE_SYSTEM_CLI: '${result.missing}' not found on PATH`);
      console.error("    Install codex and ripgrep, set CODEX_CLI_PATH/RG_CLI_PATH, or USE_COMETIX_CODEX=1");
      process.exit(1);
    }
    for (const [name, { src }] of Object.entries(result.results)) {
      console.log(`   [${name}] bundled from system: ${src}`);
    }
    installLinuxCodeModeHost(sourceDir, platform);
    return;
  }

  logCometixCodexSkipped("prepare-src");
  if (isLinux) {
    warnLinuxUpstreamCli(platform);
    // Even when keeping upstream macOS codex/rg (non-functional), never leave a
    // Darwin code-mode-host beside a Linux-replaced CLI — or when Cometix is used.
    installLinuxCodeModeHost(sourceDir, platform);
  }
}

/**
 * Replace Darwin `codex-code-mode-host` from the mac extract with a Linux ELF.
 * @param {string} sourceDir
 * @param {string} platform
 */
function installLinuxCodeModeHost(sourceDir, platform) {
  const host = installCodeModeHost(sourceDir, platform);
  if (!host.ok) {
    console.error(`[x] code-mode-host: ${host.reason}`);
    console.error("    Install openai-codex (ships /usr/bin/codex-code-mode-host), set CODEX_CODE_MODE_HOST_PATH, or install gh+zstd for GitHub fallback.");
    process.exit(1);
  }
  console.log(`   [code-mode-host] bundled Linux ELF from: ${host.src}`);
}

function main() {
  const args = process.argv.slice(2);
  const platIdx = args.indexOf("--platform");
  const platform = platIdx !== -1 ? args[platIdx + 1] : null;
  const useCometixCodex = isCometixCodexEnabled(args);
  const useSystemCli = isSystemCliEnabled(platform ?? "", args);

  const VALID = ["mac-arm64", "mac-x64", "win", "linux-x64", "linux-arm64"];
  if (!platform || !VALID.includes(platform)) {
    console.error(`[x] Usage: prepare-src.js --platform <${VALID.join("|")}> [--use-cometix-codex] [--no-system-cli]`);
    process.exit(1);
  }

  const isLinux = platform.startsWith("linux");
  const sourceDir = isLinux
    ? path.join(SRC, platform === "linux-arm64" ? "mac-arm64" : "mac-x64")
    : path.join(SRC, platform);

  if (!fs.existsSync(sourceDir)) {
    console.error(`[x] Source not found: ${path.relative(PROJECT_ROOT, sourceDir)}/`);
    process.exit(1);
  }

  const asarContentDir = path.join(sourceDir, "_asar");
  if (!fs.existsSync(asarContentDir)) {
    console.error(`[x] _asar/ not found in ${path.relative(PROJECT_ROOT, sourceDir)}/`);
    process.exit(1);
  }

  console.log(`-- prepare-src: ${platform}`);
  console.log(`   source: ${path.relative(PROJECT_ROOT, sourceDir)}/`);
  console.log(`   USE_COMETIX_CODEX: ${useCometixCodex ? "yes" : "no"}`);
  console.log(`   USE_SYSTEM_CLI: ${useSystemCli ? "yes" : "no"}`);

  const repackedAsar = path.join(sourceDir, "app.asar");
  console.log("   [repack] _asar/ -> app.asar");
  execSync(`npx asar pack "${asarContentDir}" "${repackedAsar}"`);
  const asarSize = (fs.statSync(repackedAsar).size / 1048576).toFixed(1);
  console.log(`   [ok] app.asar: ${asarSize} MB`);

  applyBundledCli(platform, sourceDir, useCometixCodex, useSystemCli);

  if (isLinux) {
    for (const d of [".vite", "webview", "skills", "native-menu-locales", "node_modules"]) {
      const p = path.join(SRC, d);
      if (fs.existsSync(p)) fs.rmSync(p, { recursive: true });
    }
    for (const f of fs.readdirSync(SRC)) {
      const p = path.join(SRC, f);
      if (fs.statSync(p).isFile()) fs.unlinkSync(p);
    }
    const skipDirs = new Set(["node_modules"]);
    const count = copyRecursive(asarContentDir, SRC, null, skipDirs);
    console.log(`   [linux] _asar/ -> src/ (${count} files, skipped node_modules/)`);
  }

  const upstreamPkg = path.join(asarContentDir, "package.json");
  let upstreamMain = ".vite/build/early-bootstrap.js";
  if (fs.existsSync(upstreamPkg)) {
    const upstream = JSON.parse(fs.readFileSync(upstreamPkg, "utf-8"));
    const rootPkgPath = path.join(PROJECT_ROOT, "package.json");
    const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8"));
    const oldVer = rootPkg.version;
    rootPkg.version = upstream.version || rootPkg.version;
    // 26.623 used bootstrap.js; 26.707+ uses early-bootstrap.js — follow upstream.
    upstreamMain = (upstream.main || upstreamMain).replace(/^\.\//, "");
    rootPkg.main = path.posix.join("src", upstreamMain);
    for (const key of [
      "codexBuildNumber", "codexBuildFlavor",
      "codexSparkleFeedUrl", "codexSparklePublicKey",
      "codexWindowsUpdateUrl", "codexWindowsPackageIdentity",
      "codexWindowsPackagePublisher",
    ]) {
      if (upstream[key]) rootPkg[key] = upstream[key];
    }
    fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n");
    console.log(`   version: ${oldVer} -> ${rootPkg.version}`);
    console.log(`   main: ${rootPkg.main}`);
  }

  if (!isLinux) {
    const stubDir = path.join(SRC, ".vite", "build");
    fs.mkdirSync(stubDir, { recursive: true });
    const stubName = path.basename(upstreamMain) || "early-bootstrap.js";
    fs.writeFileSync(path.join(stubDir, stubName), "// stub - real code in app.asar\n");
    const asarPkg = path.join(asarContentDir, "package.json");
    if (fs.existsSync(asarPkg)) {
      fs.copyFileSync(asarPkg, path.join(SRC, "package.json"));
    }
  }

  const marker = path.join(SRC, ".build-mode");
  fs.writeFileSync(marker, isLinux ? "linux" : "upstream-asar");
  console.log(`   [mode] ${isLinux ? "linux (forge packs ASAR)" : "upstream-asar (pre-built)"}`);

  console.log(`   [ok] src/ ready for ${platform} build`);
}

main();
