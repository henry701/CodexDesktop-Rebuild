/**
 * Resolve / fetch Linux `codex-code-mode-host` (sibling of bundled `codex`).
 *
 * Upstream Desktop ships a Darwin Mach-O host in the mac extract. Linux builds
 * that copy that file get `Exec format error` when code mode starts. Official
 * Linux musl hosts are published on openai/codex GitHub releases.
 *
 * Resolution order:
 *   1. CODEX_CODE_MODE_HOST_PATH
 *   2. Cached vendor/code-mode-host/<platform>/codex-code-mode-host
 *   3. Download rust-v{VERSION} asset from openai/codex (VERSION from
 *      CODEX_CODE_MODE_HOST_VERSION, or `codex --version`, or CODEX_CLI_PATH)
 */
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const { resolveFromPath } = require("./system-cli");

const PROJECT_ROOT = path.join(__dirname, "..");
const VENDOR_ROOT = path.join(PROJECT_ROOT, "vendor", "code-mode-host");
const RELEASE_REPO = "openai/codex";

const PLATFORM_ASSET = {
  "linux-x64": "codex-code-mode-host-x86_64-unknown-linux-musl.zst",
  "linux-arm64": "codex-code-mode-host-aarch64-unknown-linux-musl.zst",
};

/**
 * @param {string} platform
 * @returns {string | null}
 */
function assetNameForPlatform(platform) {
  return PLATFORM_ASSET[platform] || null;
}

/**
 * @returns {string | null}
 */
function detectCodexCliVersion() {
  if (process.env.CODEX_CODE_MODE_HOST_VERSION) {
    return process.env.CODEX_CODE_MODE_HOST_VERSION.replace(/^v/, "").replace(/^rust-v/, "");
  }
  const codex = resolveFromPath("codex", process.env.CODEX_CLI_PATH);
  if (!codex) return null;
  try {
    const out = execSync(`"${codex}" --version`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    // e.g. "codex-cli 0.144.1"
    const m = out.match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} platform
 * @returns {string}
 */
function vendorHostPath(platform) {
  return path.join(VENDOR_ROOT, platform, "codex-code-mode-host");
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function isElfExecutable(filePath) {
  try {
    const out = execSync(`file -b "${filePath}"`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return out.includes("ELF") && !out.includes("Mach-O");
  } catch {
    return false;
  }
}

/**
 * @param {string} platform
 * @param {string} version
 * @returns {string} path to cached host
 */
function downloadOfficialHost(platform, version) {
  const asset = assetNameForPlatform(platform);
  if (!asset) {
    throw new Error(`No official code-mode-host asset mapping for ${platform}`);
  }
  const tag = `rust-v${version}`;
  const destDir = path.join(VENDOR_ROOT, platform);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, "codex-code-mode-host");
  const tmpZst = path.join(destDir, asset);

  console.log(`   [code-mode-host] downloading ${tag} / ${asset}`);
  const dl = spawnSync(
    "gh",
    ["release", "download", tag, "--repo", RELEASE_REPO, "-p", asset, "-D", destDir, "--clobber"],
    { encoding: "utf-8" },
  );
  if (dl.status !== 0) {
    throw new Error(
      `gh release download failed for ${tag}/${asset}: ${(dl.stderr || dl.stdout || "").trim()}`,
    );
  }
  if (!fs.existsSync(tmpZst)) {
    throw new Error(`Downloaded asset missing: ${tmpZst}`);
  }

  const zstd = spawnSync("zstd", ["-d", "-f", "-o", dest, tmpZst], { encoding: "utf-8" });
  if (zstd.status !== 0) {
    throw new Error(`zstd decompress failed: ${(zstd.stderr || zstd.stdout || "").trim()}`);
  }
  try {
    fs.unlinkSync(tmpZst);
  } catch {
    /* ignore */
  }
  fs.chmodSync(dest, 0o755);
  if (!isElfExecutable(dest)) {
    throw new Error(`Downloaded host is not a Linux ELF: ${dest}`);
  }
  return dest;
}

/**
 * @param {string} platform linux-x64 | linux-arm64
 * @returns {{ ok: true, src: string } | { ok: false, reason: string }}
 */
function resolveCodeModeHost(platform) {
  const override = process.env.CODEX_CODE_MODE_HOST_PATH;
  if (override && fs.existsSync(override)) {
    return { ok: true, src: fs.realpathSync(override) };
  }

  const cached = vendorHostPath(platform);
  if (fs.existsSync(cached) && isElfExecutable(cached)) {
    return { ok: true, src: cached };
  }

  if (!assetNameForPlatform(platform)) {
    return { ok: false, reason: `unsupported platform ${platform}` };
  }

  const version = detectCodexCliVersion();
  if (!version) {
    return {
      ok: false,
      reason: "could not detect codex version (set CODEX_CODE_MODE_HOST_VERSION or install codex)",
    };
  }

  try {
    const src = downloadOfficialHost(platform, version);
    return { ok: true, src };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Copy a Linux ELF host into destDir as `codex-code-mode-host`.
 *
 * @param {string} destDir
 * @param {string} platform
 * @returns {{ ok: true, src: string, dest: string } | { ok: false, reason: string }}
 */
function installCodeModeHost(destDir, platform) {
  const resolved = resolveCodeModeHost(platform);
  if (!resolved.ok) return resolved;
  const dest = path.join(destDir, "codex-code-mode-host");
  fs.copyFileSync(resolved.src, dest);
  try {
    fs.chmodSync(dest, 0o755);
  } catch {
    /* ignore */
  }
  if (!isElfExecutable(dest)) {
    return { ok: false, reason: `installed host is not a Linux ELF: ${dest}` };
  }
  return { ok: true, src: resolved.src, dest };
}

module.exports = {
  assetNameForPlatform,
  detectCodexCliVersion,
  installCodeModeHost,
  isElfExecutable,
  resolveCodeModeHost,
  vendorHostPath,
};
