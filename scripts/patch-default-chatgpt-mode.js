#!/usr/bin/env node
/**
 * Official Linux ChatGPT: cold-start in ChatGPT, keep Codex in the mode switcher.
 *
 * Upstream `conversationDetailMode` defaults to STEPS_COMMANDS, which the
 * product switcher treats as Codex. Unset/missing values should be STEPS_PROSE
 * (ChatGPT). Codex remains available via the existing ChatGPT/Codex toggle.
 *
 * Linux-only: macOS/Windows in this repo are still Codex-branded.
 *
 * Usage:
 *   node scripts/patch-default-chatgpt-mode.js linux-x64
 *   node scripts/patch-default-chatgpt-mode.js --check
 */
const fs = require("fs");
const path = require("path");
const { LINUX_OFFICIAL_PLATFORMS } = require("./linux-official");
const { relPath, SRC_DIR, parsePlatformArg, existingAsarPlatforms } = require("./patch-util");

const DETAIL_MODE_FROM =
  "default:`STEPS_COMMANDS`,description:`How much turn detail Codex shows`,key:`conversationDetailMode`";
const DETAIL_MODE_TO =
  "default:`STEPS_PROSE`,description:`How much turn detail Codex shows`,key:`conversationDetailMode`";

const WXT_FROM = /e===`STEPS_EXECUTION`\?\w+:e\?\?`STEPS_COMMANDS`/g;
const COMPOSER_FROM = /persistedMode:e\(\w+\)\?\?kd\(\w+,`work`\)/g;

/**
 * @param {string} source
 * @returns {{ source: string, applied: string[], already: boolean }}
 */
function patchSource(source) {
  let next = source;
  const applied = [];

  if (next.includes(DETAIL_MODE_FROM)) {
    next = next.split(DETAIL_MODE_FROM).join(DETAIL_MODE_TO);
    applied.push("conversationDetailMode-default");
  }

  next = next.replace(new RegExp(WXT_FROM.source, "g"), (match) => {
    applied.push("wXt-fallback");
    return match.replace("`STEPS_COMMANDS`", "`STEPS_PROSE`");
  });

  next = next.replace(new RegExp(COMPOSER_FROM.source, "g"), (match) => {
    applied.push("composer-persisted-fallback");
    return match.replace("`work`", "`chat`");
  });

  const already =
    applied.length === 0 &&
    (next.includes(DETAIL_MODE_TO) ||
      /e===`STEPS_EXECUTION`\?\w+:e\?\?`STEPS_PROSE`/.test(next) ||
      /persistedMode:e\(\w+\)\?\?kd\(\w+,`chat`\)/.test(next));

  return { source: next, applied, already };
}

function candidateFiles(asarDir) {
  const files = [];
  const assets = path.join(asarDir, "webview", "assets");
  const build = path.join(asarDir, ".vite", "build");

  if (fs.existsSync(assets)) {
    for (const name of fs.readdirSync(assets)) {
      if (name.startsWith("app-initial") && name.endsWith(".js")) {
        files.push(path.join(assets, name));
      }
    }
  }
  if (fs.existsSync(build)) {
    for (const name of fs.readdirSync(build)) {
      if (name.endsWith(".js")) files.push(path.join(build, name));
    }
  }
  return files;
}

function asarDirFor(platform) {
  return path.join(SRC_DIR, platform, "_asar");
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const requested = parsePlatformArg(args);

  if (requested && !LINUX_OFFICIAL_PLATFORMS.includes(requested)) {
    console.log("  [skip] ChatGPT home default is Linux-only");
    return;
  }

  const platforms = requested
    ? [requested]
    : existingAsarPlatforms().filter((p) => LINUX_OFFICIAL_PLATFORMS.includes(p));

  if (platforms.length === 0) {
    console.log("  [skip] no official Linux ASAR (run npm run sync:linux)");
    return;
  }

  let sawDetailDefault = false;

  for (const platform of platforms) {
    const asarDir = asarDirFor(platform);
    if (!fs.existsSync(asarDir)) {
      console.error(`  [!] ${platform}: missing _asar — run npm run sync:linux`);
      process.exit(1);
    }

    const files = candidateFiles(asarDir);
    let platformHits = 0;

    for (const filePath of files) {
      const original = fs.readFileSync(filePath, "utf8");
      if (
        !original.includes("conversationDetailMode") &&
        !original.includes("STEPS_EXECUTION") &&
        !original.includes("home-composer-mode-v1")
      ) {
        continue;
      }

      const { source, applied, already } = patchSource(original);
      if (applied.length === 0) {
        if (already && original.includes(DETAIL_MODE_TO)) {
          sawDetailDefault = true;
          console.log(`  [ok] ${relPath(filePath)}: already applied`);
        }
        continue;
      }

      platformHits += applied.length;
      if (applied.includes("conversationDetailMode-default") || source.includes(DETAIL_MODE_TO)) {
        sawDetailDefault = true;
      }

      const label = isCheck ? "?" : "*";
      console.log(`  [${label}] ${relPath(filePath)}: ${applied.join(", ")}`);
      if (!isCheck && source !== original) {
        fs.writeFileSync(filePath, source, "utf8");
      }
    }

    if (platformHits === 0 && !sawDetailDefault) {
      console.log(`  [skip] ${platform}: no matching needles`);
    }
  }

  if (!sawDetailDefault) {
    console.error("[x] conversationDetailMode default: no matching upstream bundle");
    process.exit(1);
  }
}

module.exports = {
  DETAIL_MODE_FROM,
  DETAIL_MODE_TO,
  patchSource,
};

if (require.main === module) {
  main();
}
