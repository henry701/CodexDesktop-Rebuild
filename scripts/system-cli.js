/**
 * Resolve and bundle codex / rg from the host PATH (Linux builds).
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/**
 * @param {string} binName
 * @param {string | undefined} [envOverride] CODEX_CLI_PATH or RG_CLI_PATH
 * @returns {string | null}
 */
function resolveFromPath(binName, envOverride) {
  if (envOverride && fs.existsSync(envOverride)) {
    return fs.realpathSync(envOverride);
  }
  try {
    const resolved = execSync(`command -v ${binName}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (resolved && fs.existsSync(resolved)) {
      return fs.realpathSync(resolved);
    }
  } catch {
    /* not on PATH */
  }
  return null;
}

/**
 * @param {string} src
 * @param {string} dest
 */
function copyCliBinary(src, dest) {
  fs.copyFileSync(src, dest);
  try {
    fs.chmodSync(dest, 0o755);
  } catch {
    /* ignore */
  }
}

/**
 * Copy codex and rg from the system PATH into the platform resource directory.
 *
 * @param {string} destDir Directory that receives bundled `codex` and `rg` files.
 * @param {{ codex?: boolean, rg?: boolean }} [opts]
 * @returns {{ ok: true, results: Record<string, { src: string, dest: string }> } | { ok: false, missing: string }}
 */
function installSystemCli(destDir, opts = { codex: true, rg: true }) {
  /** @type {Record<string, { src: string, dest: string }>} */
  const results = {};

  if (opts.codex !== false) {
    const src = resolveFromPath("codex", process.env.CODEX_CLI_PATH);
    if (!src) return { ok: false, missing: "codex" };
    const dest = path.join(destDir, "codex");
    copyCliBinary(src, dest);
    results.codex = { src, dest };
  }

  if (opts.rg !== false) {
    const src = resolveFromPath("rg", process.env.RG_CLI_PATH);
    if (!src) return { ok: false, missing: "rg" };
    const dest = path.join(destDir, "rg");
    copyCliBinary(src, dest);
    results.rg = { src, dest };
  }

  return { ok: true, results };
}

module.exports = {
  resolveFromPath,
  installSystemCli,
};
