/**
 * Resolve @cometix/codex vendor binaries (opt-in only — see build-flags.js).
 *
 * Fork upstream: https://github.com/Haleclipse/codex
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { COMETIX_CODEX_NPM } = require("./build-flags");

const PROJECT_ROOT = path.join(__dirname, "..");

const TARGET_TRIPLE_MAP = {
  "mac-arm64": "aarch64-apple-darwin",
  "mac-x64": "x86_64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-musl",
  "linux-arm64": "aarch64-unknown-linux-musl",
  win: "x86_64-pc-windows-msvc",
};

const PLAT_PKG = {
  "linux-x64": "codex-linux-x64",
  "linux-arm64": "codex-linux-arm64",
  "mac-arm64": "codex-darwin-arm64",
  "mac-x64": "codex-darwin-x64",
  win: "codex-win32-x64",
};

const PLAT_SUFFIX = {
  "linux-x64": "linux-x64",
  "linux-arm64": "linux-arm64",
  "mac-arm64": "darwin-arm64",
  "mac-x64": "darwin-x64",
  win: "win32-x64",
};

/** @type {string | null | undefined} */
let _vendorRootCache;

/**
 * @param {string} platform
 * @returns {string | null}
 */
function ensureVendorExtracted(platform) {
  if (_vendorRootCache !== undefined && _vendorRootCache !== null) return _vendorRootCache;

  const triple = TARGET_TRIPLE_MAP[platform];
  if (!triple) return null;

  const pkg = PLAT_PKG[platform];
  if (pkg) {
    const p = path.join(PROJECT_ROOT, "node_modules", "@cometix", pkg, "vendor", triple);
    if (fs.existsSync(p)) {
      _vendorRootCache = p;
      return p;
    }
  }

  const oldPath = path.join(PROJECT_ROOT, "node_modules", "@cometix", "codex", "vendor", triple);
  if (fs.existsSync(oldPath)) {
    _vendorRootCache = oldPath;
    return oldPath;
  }

  const suffix = PLAT_SUFFIX[platform];
  if (!suffix) return null;

  let baseVer = process.env.USE_COMETIX_CODEX_VERSION;
  if (!baseVer) {
    try {
      baseVer = execSync(`npm view ${COMETIX_CODEX_NPM} version`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch {
      return null;
    }
  }

  const spec = `${COMETIX_CODEX_NPM}@${baseVer}-${suffix}`;
  console.log(`   [vendor] fetching ${spec} via npm pack...`);
  const tmpDir = path.join(require("os").tmpdir(), "cometix-codex-pack");
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const tgzName = execSync(`npm pack ${spec} --pack-destination "${tmpDir}"`, {
      cwd: tmpDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    })
      .trim()
      .split("\n")
      .pop();

    const extractDir = path.join(tmpDir, "extracted");
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
    fs.mkdirSync(extractDir, { recursive: true });
    execSync(`tar xzf "${path.join(tmpDir, tgzName)}" -C "${extractDir}"`, { stdio: "pipe" });

    const vendorRoot = path.join(extractDir, "package", "vendor", triple);
    if (fs.existsSync(vendorRoot)) {
      _vendorRootCache = vendorRoot;
      return vendorRoot;
    }
  } catch (e) {
    console.log(`   [!] npm pack failed: ${e.message}`);
  }

  return null;
}

/**
 * @param {string} platform
 * @returns {string | null}
 */
function resolveCodexVendor(platform) {
  const vendorRoot = ensureVendorExtracted(platform);
  if (!vendorRoot) return null;
  const binName = platform === "win" ? "codex.exe" : "codex";
  const p = path.join(vendorRoot, "codex", binName);
  return fs.existsSync(p) ? p : null;
}

/**
 * @param {string} platform
 * @returns {string | null}
 */
function resolveRgVendor(platform) {
  const vendorRoot = ensureVendorExtracted(platform);
  if (!vendorRoot) return null;
  const binName = platform === "win" ? "rg.exe" : "rg";
  const p = path.join(vendorRoot, "path", binName);
  return fs.existsSync(p) ? p : null;
}

module.exports = {
  TARGET_TRIPLE_MAP,
  resolveCodexVendor,
  resolveRgVendor,
};
