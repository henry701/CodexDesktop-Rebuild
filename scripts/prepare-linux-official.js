#!/usr/bin/env node
/**
 * Repack patched ASAR into the official Linux ChatGPT Electron tree and zip it.
 *
 * No electron-forge: natives and the Owl/Electron runtime are already Linux ELFs.
 *
 * Usage:
 *   node scripts/prepare-linux-official.js --platform linux-x64
 *   USE_SYSTEM_CLI=0 node scripts/prepare-linux-official.js --platform linux-x64
 */
const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");
const {
  isCometixCodexEnabled,
  isSystemCliEnabled,
  logCometixCodexSkipped,
} = require("./build-flags");
const { resolveCodexVendor, resolveRgVendor } = require("./cometix-vendor");
const { installSystemCli } = require("./system-cli");
const { installCodeModeHost, isElfExecutable } = require("./code-mode-host");
const { LINUX_OFFICIAL_PLATFORMS } = require("./linux-official");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SRC = path.join(PROJECT_ROOT, "src");
const OUT_DIR = path.join(PROJECT_ROOT, "out");
const PKG_DIR = path.join(PROJECT_ROOT, "packaging", "arch", "chatgpt-desktop-bin");

const RESOURCE_BINS = ["codex", "rg", "codex-code-mode-host"];
const BUNDLE_BINS = ["ChatGPT", "browser_crashpad_handler", "codex-launcher"];

function chmod755(filePath) {
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {
    /* ignore */
  }
}

function copyTree(src, dest) {
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  execFileSync("cp", ["-a", "--reflink=auto", src, dest], { stdio: "inherit" });
}

function getVersion(asarDir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(asarDir, "package.json"), "utf-8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

function assertElf(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`missing ${label}: ${filePath}`);
  }
  if (!isElfExecutable(filePath)) {
    throw new Error(`${label} is not a Linux ELF: ${filePath}`);
  }
}

function applyCli(resourcesDir, platform, useCometixCodex, useSystemCli) {
  if (useCometixCodex) {
    const vendorCodex = resolveCodexVendor(platform);
    if (vendorCodex) {
      const dest = path.join(resourcesDir, "codex");
      fs.copyFileSync(vendorCodex, dest);
      chmod755(dest);
      console.log("   [codex] replaced with @cometix/codex");
    } else {
      console.log(`   [!] @cometix/codex vendor not found for ${platform}, keeping official`);
    }
    const vendorRg = resolveRgVendor(platform);
    if (vendorRg) {
      const dest = path.join(resourcesDir, "rg");
      fs.copyFileSync(vendorRg, dest);
      chmod755(dest);
      console.log("   [rg] replaced with @cometix/codex");
    }
    const host = installCodeModeHost(resourcesDir, platform);
    if (!host.ok) {
      console.error(`[x] code-mode-host: ${host.reason}`);
      process.exit(1);
    }
    console.log(`   [code-mode-host] ${host.src}`);
    return;
  }

  if (useSystemCli) {
    const result = installSystemCli(resourcesDir);
    if (!result.ok) {
      console.error(`[x] USE_SYSTEM_CLI: '${result.missing}' not found on PATH`);
      console.error("    Install openai-codex + ripgrep, or set USE_SYSTEM_CLI=0 to keep the official Linux ELFs.");
      process.exit(1);
    }
    for (const [name, { src }] of Object.entries(result.results)) {
      console.log(`   [${name}] bundled from system: ${src}`);
    }
    const host = installCodeModeHost(resourcesDir, platform);
    if (!host.ok) {
      console.error(`[x] code-mode-host: ${host.reason}`);
      process.exit(1);
    }
    console.log(`   [code-mode-host] ${host.src}`);
    return;
  }

  logCometixCodexSkipped("prepare-linux-official");
  console.log("   [cli] keeping official Linux bundled ELFs (USE_SYSTEM_CLI=0)");
  for (const name of RESOURCE_BINS) {
    assertElf(path.join(resourcesDir, name), name);
  }
}

function syncRootPackageJson(asarDir) {
  const upstreamPkg = path.join(asarDir, "package.json");
  if (!fs.existsSync(upstreamPkg)) return;
  const upstream = JSON.parse(fs.readFileSync(upstreamPkg, "utf-8"));
  const rootPkgPath = path.join(PROJECT_ROOT, "package.json");
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8"));
  const oldVer = rootPkg.version;
  rootPkg.version = upstream.version || rootPkg.version;
  const upstreamMain = (upstream.main || ".vite/build/early-bootstrap.js").replace(/^\.\//, "");
  rootPkg.main = path.posix.join("src", upstreamMain);
  for (const key of [
    "codexBuildNumber",
    "codexBuildFlavor",
    "codexSparkleFeedUrl",
    "codexSparklePublicKey",
    "codexWindowsUpdateUrl",
    "codexWindowsPackageIdentity",
    "codexWindowsPackagePublisher",
  ]) {
    if (upstream[key]) rootPkg[key] = upstream[key];
  }
  fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n");
  console.log(`   version: ${oldVer} -> ${rootPkg.version}`);
}

function zipOut(outApp, zipPath) {
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  const parent = path.dirname(outApp);
  const name = path.basename(outApp);
  for (const bin of ["7zz", "7z"]) {
    try {
      execFileSync(bin, ["a", "-tzip", "-mx=5", zipPath, name], { cwd: parent, stdio: "inherit" });
      return;
    } catch {
      /* try next */
    }
  }
  execFileSync("zip", ["-r", "-q", zipPath, name], { cwd: parent, stdio: "inherit" });
}

function main() {
  const args = process.argv.slice(2);
  const platIdx = args.indexOf("--platform");
  const platform = platIdx !== -1 ? args[platIdx + 1] : "linux-x64";
  if (!LINUX_OFFICIAL_PLATFORMS.includes(platform)) {
    console.error(`[x] Usage: prepare-linux-official.js --platform <${LINUX_OFFICIAL_PLATFORMS.join("|")}>`);
    process.exit(1);
  }

  const useCometixCodex = isCometixCodexEnabled(args);
  const useSystemCli = isSystemCliEnabled(platform, args);

  const platformDir = path.join(SRC, platform);
  const asarDir = path.join(platformDir, "_asar");
  const bundleDir = path.join(platformDir, "bundle");
  if (!fs.existsSync(asarDir) || !fs.existsSync(bundleDir)) {
    console.error(`[x] ${path.relative(PROJECT_ROOT, platformDir)}/{_asar,bundle} missing. Run: npm run sync:linux`);
    process.exit(1);
  }

  console.log(`\n== Prepare official Linux ChatGPT: ${platform} ==`);
  console.log(`   USE_COMETIX_CODEX: ${useCometixCodex ? "yes" : "no"}`);
  console.log(`   USE_SYSTEM_CLI: ${useSystemCli ? "yes" : "no"}`);

  const asarPath = path.join(bundleDir, "resources", "app.asar");
  console.log("   [asar pack] _asar/ -> bundle/resources/app.asar");
  execSync(`npx asar pack "${asarDir}" "${asarPath}"`, { stdio: "inherit", cwd: PROJECT_ROOT });
  console.log(`   [ok] app.asar ${(fs.statSync(asarPath).size / 1048576).toFixed(1)} MB`);

  applyCli(path.join(bundleDir, "resources"), platform, useCometixCodex, useSystemCli);

  for (const name of BUNDLE_BINS) {
    const p = path.join(bundleDir, name);
    if (fs.existsSync(p)) chmod755(p);
  }
  for (const name of RESOURCE_BINS) {
    const p = path.join(bundleDir, "resources", name);
    if (fs.existsSync(p)) chmod755(p);
  }
  assertElf(path.join(bundleDir, "ChatGPT"), "ChatGPT");
  assertElf(path.join(bundleDir, "resources", "codex-code-mode-host"), "codex-code-mode-host");

  syncRootPackageJson(asarDir);

  const version = getVersion(asarDir);
  const outName = `ChatGPT-linux-${platform === "linux-arm64" ? "arm64" : "x64"}`;
  const outApp = path.join(OUT_DIR, outName);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`   [copy] bundle -> out/${outName}`);
  copyTree(bundleDir, outApp);

  const zipName = `${outName}-${version}.zip`;
  const zipPath = path.join(OUT_DIR, zipName);
  console.log(`   [zip] ${zipName}`);
  zipOut(outApp, zipPath);
  console.log(`   [ok] ${zipPath} (${(fs.statSync(zipPath).size / 1048576).toFixed(1)} MB)`);

  if (platform === "linux-x64" && fs.existsSync(PKG_DIR)) {
    const pkgZip = path.join(PKG_DIR, zipName);
    console.log(`   [copy] ${path.relative(PROJECT_ROOT, pkgZip)}`);
    fs.copyFileSync(zipPath, pkgZip);
  }

  const marker = path.join(SRC, ".build-mode");
  fs.writeFileSync(marker, "linux-official");
  console.log("   [mode] linux-official (no forge)");
}

main();
