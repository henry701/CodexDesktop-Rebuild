#!/usr/bin/env node
/**
 * Unit tests for official Linux ChatGPT deb helpers.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { parseDebianPackages, LINUX_OFFICIAL } = require("../linux-official");
const patchUtil = require("../patch-util");
const pkg = require("../../package.json");

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

const PACKAGES = `Package: chatgpt
Version: 26.814.41957
Architecture: amd64
Filename: pool/main/c/chatgpt/chatgpt_26.814.41957_amd64.deb
Size: 385510290
SHA256: 4778b26a7abd08647214d5b05c17bd3ebe2d9688d146dabf017c1a2faf93ac7d
Description: ChatGPT by OpenAI
 ChatGPT is an AI assistant from OpenAI.
`;

console.log("linux-official");

test("parses Debian Packages chatgpt stanza", () => {
  const info = parseDebianPackages(PACKAGES);
  assert.strictEqual(info.version, "26.814.41957");
  assert.strictEqual(info.architecture, "amd64");
  assert.strictEqual(
    info.url,
    "https://persistent.oaistatic.com/codex-app-prod/linux/deb/pool/main/c/chatgpt/chatgpt_26.814.41957_amd64.deb",
  );
  assert.strictEqual(
    info.sha256,
    "4778b26a7abd08647214d5b05c17bd3ebe2d9688d146dabf017c1a2faf93ac7d",
  );
  assert.strictEqual(info.size, 385510290);
});

test("maps linux platforms to latest deb URLs", () => {
  assert.match(LINUX_OFFICIAL["linux-x64"].latestUrl, /chatgpt_amd64\.deb$/);
  assert.match(LINUX_OFFICIAL["linux-arm64"].latestUrl, /chatgpt_arm64\.deb$/);
});

test("parsePlatformArg accepts linux-x64", () => {
  assert.strictEqual(patchUtil.parsePlatformArg(["--check", "linux-x64"]), "linux-x64");
  assert.ok(patchUtil.PATCH_PLATFORMS.includes("linux-x64"));
  assert.ok(patchUtil.PATCH_PLATFORMS.includes("linux-arm64"));
});

test("rejects Packages text without chatgpt", () => {
  assert.throws(() => parseDebianPackages("Package: foo\nVersion: 1\n"), /chatgpt stanza not found/);
});

test("npm run build produces official Linux ChatGPT, not legacy Codex forge", () => {
  assert.strictEqual(pkg.scripts.build, "npm run build:linux-x64");
  assert.strictEqual(
    pkg.scripts["build:linux-x64"],
    "node scripts/prepare-linux-official.js --platform linux-x64",
  );
  assert.match(pkg.scripts["build:linux-x64:forge"], /electron-forge/);
});

test("BASE_PATCHES does not rewrite ChatGPT's in-app home default", () => {
  const patchAll = fs.readFileSync(path.join(__dirname, "../patch-all.js"), "utf8");
  assert.doesNotMatch(patchAll, /patch-default-chatgpt-mode/);
  assert.ok(!fs.existsSync(path.join(__dirname, "../patch-default-chatgpt-mode.js")));
});

console.log("all linux-official tests passed");
