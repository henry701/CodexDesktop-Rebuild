#!/usr/bin/env node
/**
 * Ensure node_modules/electron/dist is fully extracted.
 *
 * extract-zip (used by @electron/get and @electron/packager) can finish early on
 * Node 24+ with a partial dist/ tree. Use system unzip for a complete Electron
 * runtime (matches upstream CI Node version and avoids renderer compositor bugs).
 */
const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const PROJECT_ROOT = path.join(__dirname, "..");
const electronPkg = path.join(PROJECT_ROOT, "node_modules", "electron");
const distDir = path.join(electronPkg, "dist");
const marker = path.join(distDir, "electron");

const PACKAGER_UNZIP_PATCH = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractElectronZip = void 0;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
async function extractElectronZip(zipPath, targetDir) {
  await fs_1.promises.mkdir(targetDir, { recursive: true });
  (0, child_process_1.execFileSync)("unzip", ["-oq", zipPath, "-d", targetDir], { stdio: "inherit" });
}
exports.extractElectronZip = extractElectronZip;
`;

function isDistComplete() {
  try {
    return fs.existsSync(marker) && fs.statSync(marker).isFile() && fs.statSync(marker).size > 0;
  } catch {
    return false;
  }
}

function findCachedZip() {
  const cacheRoot = path.join(require("os").homedir(), ".cache", "electron");
  if (!fs.existsSync(cacheRoot)) return null;

  let version;
  try {
    version = require(path.join(electronPkg, "package.json")).version;
  } catch {
    return null;
  }

  /** @type {string | null} */
  let newest = null;
  let newestMtime = 0;

  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      let st;
      try {
        st = fs.statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.endsWith(".zip") || !name.includes(version)) continue;
      if (st.mtimeMs >= newestMtime) {
        newestMtime = st.mtimeMs;
        newest = p;
      }
    }
  };

  walk(cacheRoot);
  return newest;
}

function extractWithUnzip(zipPath, targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  execFileSync("unzip", ["-oq", zipPath, "-d", targetDir], { stdio: "inherit" });
}

function patchPackagerUnzip() {
  const unzipPath = path.join(PROJECT_ROOT, "node_modules", "@electron/packager", "dist", "unzip.js");
  if (!fs.existsSync(unzipPath)) return;

  const current = fs.readFileSync(unzipPath, "utf8");
  if (current === PACKAGER_UNZIP_PATCH) return;

  fs.writeFileSync(unzipPath, PACKAGER_UNZIP_PATCH);
  console.log("[ensure-electron-dist] patched @electron/packager/dist/unzip.js");
}

function main() {
  patchPackagerUnzip();

  if (isDistComplete()) {
    console.log("[ensure-electron-dist] ok");
    return;
  }

  console.log("[ensure-electron-dist] incomplete dist, re-extracting with unzip...");

  let zipPath = findCachedZip();
  if (!zipPath) {
    execSync("node node_modules/electron/install.js", { cwd: PROJECT_ROOT, stdio: "inherit" });
    if (isDistComplete()) {
      console.log("[ensure-electron-dist] ok after install.js");
      return;
    }
    zipPath = findCachedZip();
  }

  if (!zipPath) {
    console.error("[ensure-electron-dist] electron zip not found in cache");
    process.exit(1);
  }

  extractWithUnzip(zipPath, distDir);
  if (!isDistComplete()) {
    console.error("[ensure-electron-dist] dist still incomplete after unzip");
    process.exit(1);
  }
  console.log("[ensure-electron-dist] ok (unzip fallback)");
}

if (require.main === module) {
  main();
}

module.exports = { main, patchPackagerUnzip, isDistComplete };
