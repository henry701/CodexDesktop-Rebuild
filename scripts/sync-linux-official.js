#!/usr/bin/env node
/**
 * Sync the official Linux ChatGPT .deb into src/linux-{x64,arm64}/.
 *
 * Output:
 *   src/{platform}/bundle/   full /usr/lib/chatgpt tree (Electron + resources)
 *   src/{platform}/_asar/    extracted app.asar (patch target)
 *
 * Does not run Debian maintainer scripts (postinst writes apt sources).
 *
 * Usage:
 *   node scripts/sync-linux-official.js
 *   node scripts/sync-linux-official.js --platform linux-arm64
 *   node scripts/sync-linux-official.js --check-only
 *   LINUX_DEB_PATH=/path/chatgpt.deb node scripts/sync-linux-official.js
 *   LINUX_EXTRACT_PATH=/path/extract node scripts/sync-linux-official.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, execSync } = require("child_process");
const {
  LINUX_OFFICIAL_PLATFORMS,
  fetchLinuxDebInfo,
  officialLinuxSpec,
} = require("./linux-official");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(PROJECT_ROOT, "src");
const VERSION_FILE = path.join(__dirname, ".versions.json");
const TEMP_DIR = path.join(os.tmpdir(), "chatgpt-linux-sync");
const AGENT_DEB = path.join(
  os.homedir(),
  "tmp",
  "agent-tmp",
  "codex-desktop-linux-official",
  "chatgpt_amd64.deb",
);
const AGENT_EXTRACT = path.join(
  os.homedir(),
  "tmp",
  "agent-tmp",
  "codex-desktop-linux-official",
  "extract",
);

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const CHECK_ONLY = args.includes("--check-only");
const platIdx = args.indexOf("--platform");
const PLATFORM =
  platIdx !== -1
    ? args[platIdx + 1]
    : args.find((a) => LINUX_OFFICIAL_PLATFORMS.includes(a)) || "linux-x64";

if (!LINUX_OFFICIAL_PLATFORMS.includes(PLATFORM)) {
  console.error(`[x] Usage: sync-linux-official.js [--platform ${LINUX_OFFICIAL_PLATFORMS.join("|")}]`);
  process.exit(1);
}

function loadVersions() {
  try {
    return JSON.parse(fs.readFileSync(VERSION_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveVersions(v) {
  fs.writeFileSync(VERSION_FILE, JSON.stringify(v, null, 2) + "\n");
}

function sha256File(filePath) {
  const out = execFileSync("sha256sum", [filePath], { encoding: "utf-8" });
  return out.split(/\s+/)[0].toLowerCase();
}

function clearDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyTree(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  execFileSync("cp", ["-a", "--reflink=auto", src, dest], { stdio: "inherit" });
}

function findChatgptLib(extractRoot) {
  const direct = path.join(extractRoot, "ChatGPT");
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return extractRoot;
  const nested = path.join(extractRoot, "usr", "lib", "chatgpt");
  if (fs.existsSync(path.join(nested, "ChatGPT"))) return nested;
  throw new Error(`ChatGPT binary not found under ${extractRoot}`);
}

function extractDeb(debPath, extractDir) {
  clearDir(extractDir);
  execFileSync("dpkg-deb", ["-x", debPath, extractDir], { stdio: "inherit" });
}

function assemble(libDir, destDir) {
  const asarPath = path.join(libDir, "resources", "app.asar");
  if (!fs.existsSync(asarPath)) {
    throw new Error(`app.asar missing: ${asarPath}`);
  }

  console.log(`   [assemble] -> ${path.relative(PROJECT_ROOT, destDir)}/`);
  clearDir(destDir);

  const bundleDir = path.join(destDir, "bundle");
  copyTree(libDir, bundleDir);

  const asarDest = path.join(destDir, "_asar");
  console.log("   [asar extract] -> _asar/");
  execSync(`npx asar extract "${path.join(bundleDir, "resources", "app.asar")}" "${asarDest}"`, {
    stdio: "inherit",
    cwd: PROJECT_ROOT,
  });

  const metaPath = path.join(bundleDir, "resources", "linux-package-metadata.json");
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    console.log(`   [brand] ${meta.codexAppBrand || "?"}  version ${meta.version || "?"}`);
  }
}

function resolveDebPath(info) {
  const envDeb = process.env.LINUX_DEB_PATH;
  if (envDeb && fs.existsSync(envDeb)) {
    console.log(`   [deb] LINUX_DEB_PATH=${envDeb}`);
    return envDeb;
  }

  const cached = path.join(TEMP_DIR, `chatgpt_${info.version}_${info.architecture || "amd64"}.deb`);
  if (fs.existsSync(cached)) {
    if (!info.sha256 || sha256File(cached) === info.sha256) {
      console.log(`   [cache] ${cached}`);
      return cached;
    }
    console.log("   [cache] sha256 mismatch, re-downloading");
  }

  if (
    PLATFORM === "linux-x64" &&
    fs.existsSync(AGENT_DEB) &&
    (!info.sha256 || sha256File(AGENT_DEB) === info.sha256)
  ) {
    console.log(`   [cache] ${AGENT_DEB}`);
    return AGENT_DEB;
  }

  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const url = info.url || officialLinuxSpec(PLATFORM).latestUrl;
  console.log(`   [dl] ${url}`);
  execSync(`curl -L --retry 3 --retry-delay 2 -o "${cached}" "${url}"`, { stdio: "inherit" });
  if (info.sha256) {
    const got = sha256File(cached);
    if (got !== info.sha256) {
      throw new Error(`deb sha256 mismatch: expected ${info.sha256}, got ${got}`);
    }
  }
  return cached;
}

function resolveExtractPath() {
  const envExtract = process.env.LINUX_EXTRACT_PATH;
  if (envExtract && fs.existsSync(envExtract)) return envExtract;
  if (PLATFORM === "linux-x64" && fs.existsSync(path.join(AGENT_EXTRACT, "usr", "lib", "chatgpt", "ChatGPT"))) {
    return AGENT_EXTRACT;
  }
  return null;
}

async function main() {
  console.log(`== Official Linux ChatGPT sync (${PLATFORM}) ==\n`);

  if (!LINUX_OFFICIAL_PLATFORMS.includes(PLATFORM)) {
    throw new Error(`unsupported platform ${PLATFORM}`);
  }

  let info;
  try {
    info = await fetchLinuxDebInfo(PLATFORM);
    console.log(`   remote: chatgpt ${info.version} (${info.architecture})`);
    console.log(`   size:   ${(info.size / 1048576).toFixed(1)} MB`);
  } catch (err) {
    console.error(`   [!] Packages index: ${err instanceof Error ? err.message : err}`);
    info = {
      version: "unknown",
      architecture: officialLinuxSpec(PLATFORM).arch,
      sha256: "",
      url: officialLinuxSpec(PLATFORM).latestUrl,
      size: 0,
    };
  }

  if (CHECK_ONLY) {
    const saved = loadVersions();
    const prev = saved[PLATFORM]?.version;
    const isNew = !prev || prev !== info.version;
    console.log(isNew ? `   update: ${prev || "none"} -> ${info.version}` : "   up to date");
    return;
  }

  const destDir = path.join(SRC_DIR, PLATFORM);
  const saved = loadVersions();
  if (!FORCE && saved[PLATFORM]?.version === info.version && fs.existsSync(path.join(destDir, "_asar"))) {
    console.log(`   [skip] ${PLATFORM} already at ${info.version} (pass --force to re-extract)`);
    return;
  }

  const extractHint = resolveExtractPath();
  let libDir;
  if (extractHint && !FORCE) {
    console.log(`   [extract] ${extractHint}`);
    libDir = findChatgptLib(extractHint);
  } else {
    const debPath = resolveDebPath(info);
    const extractDir = path.join(TEMP_DIR, `${PLATFORM}-extract`);
    console.log("   [dpkg-deb -x] (no postinst)");
    extractDeb(debPath, extractDir);
    libDir = findChatgptLib(extractDir);
  }

  assemble(libDir, destDir);

  const next = loadVersions();
  next[PLATFORM] = {
    version: info.version,
    build: "",
    sha256: info.sha256 || undefined,
    checkedAt: new Date().toISOString(),
  };
  saveVersions(next);
  console.log(`\n== Done: ${PLATFORM} ${info.version} ==`);
}

main().catch((e) => {
  console.error(`\n[x] ${e.message}`);
  process.exit(1);
});
