#!/usr/bin/env node
/**
 * Prune local build/sync caches so repeated `npm run sync` / linux builds
 * do not accumulate multi-GB zip/extract leftovers.
 *
 * Default KEEP_VERSIONS=3 for packaging/arch/codex-desktop-bin artifacts
 * (Codex-linux-x64-*.zip and codex-desktop-*-x86_64.pkg.tar.zst), keyed by
 * app version (highest pkgrel kept per version).
 *
 * Also removes:
 *   - os.tmpdir()/codex-sync downloads + extract dirs (after sync)
 *   - packaging/arch/codex-desktop-bin/{src,pkg} makepkg leftovers
 *   - optional: out/ when --out is passed
 *
 * Usage:
 *   npm run prune:artifacts
 *   KEEP_VERSIONS=4 node scripts/prune-artifacts.js
 *   node scripts/prune-artifacts.js --keep-sync-zips   # leave /tmp/codex-sync zips
 *   node scripts/prune-artifacts.js --out
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PKG_DIR = path.join(PROJECT_ROOT, "packaging", "arch", "codex-desktop-bin");
const TEMP_DIR = path.join(os.tmpdir(), "codex-sync");
const OUT_DIR = path.join(PROJECT_ROOT, "out");

const args = process.argv.slice(2);
const KEEP_SYNC_ZIPS = args.includes("--keep-sync-zips");
const PRUNE_OUT = args.includes("--out");
const KEEP_VERSIONS = Math.max(1, parseInt(process.env.KEEP_VERSIONS || "3", 10) || 3);

function rmrf(p) {
  if (!fs.existsSync(p)) return false;
  fs.rmSync(p, { recursive: true, force: true });
  return true;
}

function parseArtifact(filePath) {
  let base = path.basename(filePath);
  base = base.replace(/^Codex-linux-x64-/, "").replace(/^codex-desktop-/, "");
  base = base.replace(/-x86_64\.pkg\.tar\.zst$/, "").replace(/\.zip$/, "");
  if (/-(\d+)$/.test(base) && base.includes("-")) {
    const pkgrel = Number(RegExp.$1);
    const appVer = base.slice(0, -(RegExp.$1.length + 1));
    return { appVer, pkgrel };
  }
  return { appVer: base, pkgrel: 0 };
}

function appVerKey(ver) {
  const [a = 0, b = 0, c = 0] = String(ver).split(".").map((n) => parseInt(n, 10) || 0);
  return [a, b, c].map((n) => String(n).padStart(5, "0")).join(".");
}

function pruneGlob(dir, pattern, label) {
  if (!fs.existsSync(dir)) {
    console.log(`[prune] ${label}: dir missing`);
    return;
  }
  const re = new RegExp(
    "^" +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*") +
      "$",
  );
  const files = fs
    .readdirSync(dir)
    .filter((f) => re.test(f))
    .map((f) => path.join(dir, f))
    .filter((f) => fs.statSync(f).isFile());

  if (files.length === 0) {
    console.log(`[prune] ${label}: none`);
    return;
  }

  const ranked = files
    .map((f) => {
      const { appVer, pkgrel } = parseArtifact(f);
      return { f, appVer, pkgrel, key: `${appVerKey(appVer)}.${String(pkgrel).padStart(5, "0")}` };
    })
    .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));

  const seen = new Set();
  const keep = [];
  const drop = [];
  for (const row of ranked) {
    if (!seen.has(row.appVer)) {
      seen.add(row.appVer);
      if (keep.length < KEEP_VERSIONS) keep.push(row.f);
      else drop.push(row.f);
    } else {
      drop.push(row.f);
    }
  }

  console.log(
    `[prune] ${label}: keep ${keep.length} app versions / drop ${drop.length} (KEEP_VERSIONS=${KEEP_VERSIONS})`,
  );
  for (const f of keep) console.log(`  keep  ${path.basename(f)}`);
  for (const f of drop) {
    console.log(`  drop  ${path.basename(f)}`);
    fs.unlinkSync(f);
  }
}

function pruneSyncTemp() {
  if (!fs.existsSync(TEMP_DIR)) {
    console.log("[prune] codex-sync temp: none");
    return;
  }
  let removed = 0;
  for (const name of fs.readdirSync(TEMP_DIR)) {
    const p = path.join(TEMP_DIR, name);
    const st = fs.statSync(p);
    if (st.isDirectory() && /extract/i.test(name)) {
      console.log(`  drop  ${path.relative(os.tmpdir(), p)}/`);
      rmrf(p);
      removed++;
      continue;
    }
    if (!KEEP_SYNC_ZIPS && st.isFile() && /\.(zip|msix)$/i.test(name)) {
      console.log(`  drop  ${path.relative(os.tmpdir(), p)}`);
      fs.unlinkSync(p);
      removed++;
    }
  }
  // Remove empty temp root
  try {
    if (fs.readdirSync(TEMP_DIR).length === 0) rmrf(TEMP_DIR);
  } catch {
    /* ignore */
  }
  console.log(`[prune] codex-sync temp: removed ${removed} entries${KEEP_SYNC_ZIPS ? " (kept zips)" : ""}`);
}

function pruneMakepkgLeftovers() {
  let n = 0;
  for (const name of ["src", "pkg"]) {
    const p = path.join(PKG_DIR, name);
    if (rmrf(p)) {
      console.log(`  drop  packaging/arch/codex-desktop-bin/${name}/`);
      n++;
    }
  }
  console.log(`[prune] makepkg leftovers: removed ${n}`);
}

function main() {
  console.log(`== prune-artifacts (KEEP_VERSIONS=${KEEP_VERSIONS}) ==`);
  pruneSyncTemp();
  pruneGlob(PKG_DIR, "Codex-linux-x64-*.zip", "packaging zips");
  pruneGlob(PKG_DIR, "codex-desktop-*-x86_64.pkg.tar.zst", "packaging pkgs");
  pruneMakepkgLeftovers();
  if (PRUNE_OUT) {
    if (rmrf(OUT_DIR)) console.log("[prune] out/: removed");
    else console.log("[prune] out/: none");
  }
  console.log("== done ==");
}

main();
