/**
 * Shared build-time flags for CodexDesktop-Rebuild.
 *
 * USE_COMETIX_CODEX (default: off)
 *   When enabled, bundled `codex` / `rg` binaries are replaced with prebuilt
 *   artifacts from the third-party npm package @cometix/codex.
 *
 *   Upstream fork: https://github.com/Haleclipse/codex
 *   npm:           https://www.npmjs.com/package/@cometix/codex
 *
 *   Concerns (why this is opt-in, not default):
 *   - Prebuilt native binaries fetched via `npm pack` at build time; not built
 *     or audited from this repository.
 *   - Version is resolved from npm registry unless USE_COMETIX_CODEX_VERSION is set.
 *   - The CLI runs with full user privileges inside the coding agent.
 *   - A compromised npm publish would affect every build that opts in.
 *
 * Enable via environment variable or CLI flag on prepare-src / patch-all / start-dev:
 *   USE_COMETIX_CODEX=1 npm run build:linux-x64
 *   node scripts/prepare-src.js --platform linux-x64 --use-cometix-codex
 *
 * Optional pin:
 *   USE_COMETIX_CODEX_VERSION=0.135.0-cometix
 *
 * USE_SYSTEM_CLI (Linux builds: default on)
 *   Bundle `codex` and `rg` from the host PATH instead of the macOS upstream
 *   extract (which cannot execute on Linux). Cometix takes precedence when both
 *   are enabled.
 *
 *   USE_SYSTEM_CLI=0  — keep upstream macOS binaries (non-functional on Linux)
 *   USE_SYSTEM_CLI=1  — force system PATH lookup (also on non-Linux if needed)
 *
 * Optional explicit paths (override PATH lookup):
 *   CODEX_CLI_PATH=/usr/bin/codex
 *   RG_CLI_PATH=/usr/bin/rg
 *
 * Linux also replaces `codex-code-mode-host` (Darwin Mach-O in the mac extract)
 * with the official musl ELF from openai/codex GitHub releases (`rust-v{VERSION}`),
 * cached under vendor/code-mode-host/. Override with CODEX_CODE_MODE_HOST_PATH or
 * pin with CODEX_CODE_MODE_HOST_VERSION.
 *
 * USE_SHIM_MODEL_PICKER (default: off)
 *   Apply codex-shim-style Desktop patches so Shim API catalog models appear in the picker
 *   and sidebar (disables Statsig hidden-model gate). See scripts/patch-shim-model-picker.js.
 *   Needs upstream ASAR extracted under src/{platform}/_asar/ (sync + patch pipeline).
 *
 *   USE_SHIM_MODEL_PICKER=1 npm run patch:linux-x64
 *   node scripts/patch-all.js mac-x64 --shim-model-picker
 */

/** @see https://github.com/Haleclipse/codex */
const COMETIX_CODEX_REPO = "https://github.com/Haleclipse/codex";

/** npm scope package published by Cometix Space (Haleclipse). */
const COMETIX_CODEX_NPM = "@cometix/codex";

const COMETIX_CLI_FLAG = "--use-cometix-codex";
const SYSTEM_CLI_FLAG = "--use-system-cli";
const NO_SYSTEM_CLI_FLAG = "--no-system-cli";
const SHIM_MODEL_PICKER_FLAG = "--shim-model-picker";

/**
 * @param {string[]} [argv]
 * @returns {boolean}
 */
function isCometixCodexEnabled(argv = process.argv.slice(2)) {
  const env = process.env.USE_COMETIX_CODEX;
  if (env === "1" || env === "true") return true;
  if (env === "0" || env === "false") return false;
  return argv.includes(COMETIX_CLI_FLAG);
}

/**
 * Args to forward to child patch/prepare scripts when Cometix CLI is enabled.
 * @param {boolean} enabled
 * @returns {string[]}
 */
function cometixCodexPassThroughArgs(enabled) {
  return enabled ? [COMETIX_CLI_FLAG] : [];
}

/**
 * @param {string[]} [argv]
 * @returns {boolean}
 */
function isShimModelPickerEnabled(argv = process.argv.slice(2)) {
  const env = process.env.USE_SHIM_MODEL_PICKER;
  if (env === "1" || env === "true") return true;
  if (env === "0" || env === "false") return false;
  return argv.includes(SHIM_MODEL_PICKER_FLAG);
}

/**
 * @param {boolean} enabled
 * @returns {string[]}
 */
function shimModelPickerPassThroughArgs(enabled) {
  return enabled ? [SHIM_MODEL_PICKER_FLAG] : [];
}

function logCometixCodexSkipped(context) {
  console.log(
    `   [codex] keeping upstream bundled CLI (${context}; opt in: USE_COMETIX_CODEX=1 or ${COMETIX_CLI_FLAG})`,
  );
}

/**
 * @param {string} platform
 * @param {string[]} [argv]
 * @returns {boolean}
 */
function isSystemCliEnabled(platform, argv = process.argv.slice(2)) {
  const env = process.env.USE_SYSTEM_CLI;
  if (env === "0" || env === "false") return false;
  if (env === "1" || env === "true") return true;
  if (argv.includes(NO_SYSTEM_CLI_FLAG)) return false;
  if (argv.includes(SYSTEM_CLI_FLAG)) return true;
  return platform.startsWith("linux");
}

/**
 * Linux builds use macOS upstream extracts when system CLI is disabled.
 * @param {string} platform
 */
function warnLinuxUpstreamCli(platform) {
  if (!platform.startsWith("linux")) return;
  console.log(
    "   [!] Linux build with USE_SYSTEM_CLI=0: bundled codex/rg are macOS upstream binaries and will not run on Linux.",
  );
  console.log(
    `       Re-enable defaults (USE_SYSTEM_CLI=1), install codex/rg on PATH, or opt in: USE_COMETIX_CODEX=1 (fork: ${COMETIX_CODEX_REPO}).`,
  );
}

module.exports = {
  COMETIX_CODEX_REPO,
  COMETIX_CODEX_NPM,
  COMETIX_CLI_FLAG,
  SYSTEM_CLI_FLAG,
  NO_SYSTEM_CLI_FLAG,
  isCometixCodexEnabled,
  isSystemCliEnabled,
  cometixCodexPassThroughArgs,
  SHIM_MODEL_PICKER_FLAG,
  isShimModelPickerEnabled,
  shimModelPickerPassThroughArgs,
  logCometixCodexSkipped,
  warnLinuxUpstreamCli,
};
