/**
 * Shared utilities for patch scripts.
 * Provides multi-platform bundle location and common helpers.
 */
const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "src");
const PROJECT_ROOT = path.join(__dirname, "..");

/** Extracted ASAR dirs under src/. linux-* is the official ChatGPT .deb. */
const PATCH_PLATFORMS = [
  "linux-x64",
  "linux-arm64",
  "mac-arm64",
  "mac-x64",
  "win",
  "unix",
];

/**
 * @param {string[]} args
 * @param {string} [fallback]
 * @returns {string | undefined}
 */
function parsePlatformArg(args, fallback) {
  return args.find((a) => PATCH_PLATFORMS.includes(a)) || fallback;
}

/**
 * Platforms that already have an extracted `_asar/` tree.
 * @returns {string[]}
 */
function existingAsarPlatforms() {
  return PATCH_PLATFORMS.filter((p) =>
    fs.existsSync(path.join(SRC_DIR, p, "_asar")),
  );
}

/**
 * Locate bundles matching a filename pattern across platform directories.
 *
 * @param {object} opts
 * @param {"build"|"assets"} opts.dir - Subdirectory type:
 *   "build"  -> src/{plat}/.vite/build/
 *   "assets" -> src/{plat}/webview/assets/
 * @param {RegExp} opts.pattern - Filename regex (e.g. /^index-.*\.js$/)
 * @param {string} [opts.platform] - Restrict to a single platform
 * @returns {Array<{platform: string, path: string}>}
 */
function locateBundles({ dir, pattern, platform }) {
  const dirMap = {
    build: (plat) => path.join(SRC_DIR, plat, "_asar", ".vite", "build"),
    assets: (plat) => path.join(SRC_DIR, plat, "_asar", "webview", "assets"),
  };

  // Legacy fallback paths (flat src/ without _asar subdirs)
  const legacyMap = {
    build: path.join(SRC_DIR, ".vite", "build"),
    assets: path.join(SRC_DIR, "webview", "assets"),
  };

  const getDir = dirMap[dir];
  if (!getDir) throw new Error(`Unknown dir type: ${dir}`);

  const platforms = platform
    ? [platform]
    : PATCH_PLATFORMS.filter((p) => fs.existsSync(getDir(p)));

  // Legacy fallback
  if (platforms.length === 0) {
    const fallback = legacyMap[dir];
    if (fallback && fs.existsSync(fallback)) {
      const files = fs.readdirSync(fallback).filter((f) => pattern.test(f));
      if (files.length > 0) {
        // For build dir, prefer hashed file over plain
        const target =
          files.length > 1 ? files.find((f) => f !== "main.js") || files[0] : files[0];
        return [{ platform: "legacy", path: path.join(fallback, target) }];
      }
    }
    return [];
  }

  const results = [];
  for (const plat of platforms) {
    const d = getDir(plat);
    if (!fs.existsSync(d)) continue;

    const files = fs.readdirSync(d).filter((f) => pattern.test(f));
    if (files.length === 0) {
      console.warn(`  [!] ${plat}: no match for ${pattern}`);
      continue;
    }

    // For build dir with multiple matches, prefer hashed variant
    const target =
      files.length > 1 ? files.find((f) => f !== "main.js") || files[0] : files[0];

    results.push({ platform: plat, path: path.join(d, target) });
  }

  return results;
}

/**
 * Electron main-process bundle.
 *
 * Through 26.1023 this was `main.js` / `main-<hash>.js`.
 * 26.1027 moved that code into the large `early-bootstrap-<id>-<hash>.js` chunk
 * and pointed package.json `main` at `early-bootstrap.js`.
 *
 * @param {object} [opts]
 * @param {string} [opts.platform]
 * @returns {Array<{platform: string, path: string}>}
 */
function locateMainProcessBundles({ platform } = {}) {
  const getDir = (plat) => path.join(SRC_DIR, plat, "_asar", ".vite", "build");
  const platforms = platform
    ? [platform]
    : PATCH_PLATFORMS.filter((p) => fs.existsSync(getDir(p)));

  const results = [];
  for (const plat of platforms) {
    const dir = getDir(plat);
    const target = mainProcessFilename(dir);
    if (!target) {
      console.warn(`  [!] ${plat}: no main or early-bootstrap process bundle`);
      continue;
    }
    results.push({ platform: plat, path: path.join(dir, target) });
  }
  return results;
}

function mainProcessFilename(buildDir) {
  if (!fs.existsSync(buildDir)) return null;
  const files = fs.readdirSync(buildDir);
  const legacy = files.filter((f) => /^main(-[^.]+)?\.js$/.test(f));
  if (legacy.length > 0) {
    return legacy.length > 1 ? legacy.find((f) => f !== "main.js") || legacy[0] : legacy[0];
  }
  const chunks = files.filter((f) => /^early-bootstrap-.+\.js$/.test(f));
  let best = null;
  let bestScore = -1;
  for (const file of chunks) {
    const full = path.join(buildDir, file);
    let score = fs.statSync(full).size;
    const source = fs.readFileSync(full, "utf8");
    if (source.includes("removeMenu(") && source.includes("allowInspectElement")) {
      score += 1e15;
    }
    if (score > bestScore) {
      bestScore = score;
      best = file;
    }
  }
  return best;
}

/**
 * Return path relative to project root.
 */
function relPath(absPath) {
  return path.relative(PROJECT_ROOT, absPath);
}

module.exports = {
  existingAsarPlatforms,
  locateBundles,
  locateMainProcessBundles,
  mainProcessFilename,
  parsePlatformArg,
  PATCH_PLATFORMS,
  relPath,
  SRC_DIR,
  PROJECT_ROOT,
};
