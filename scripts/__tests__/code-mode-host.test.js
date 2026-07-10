#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  assetNameForPlatform,
  installCodeModeHost,
  isElfExecutable,
  resolveCodeModeHost,
  vendorHostPath,
} = require("../code-mode-host");

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

console.log("code-mode-host");

test("maps linux platforms to musl release assets", () => {
  assert.strictEqual(
    assetNameForPlatform("linux-x64"),
    "codex-code-mode-host-x86_64-unknown-linux-musl.zst",
  );
  assert.strictEqual(
    assetNameForPlatform("linux-arm64"),
    "codex-code-mode-host-aarch64-unknown-linux-musl.zst",
  );
  assert.strictEqual(assetNameForPlatform("mac-x64"), null);
});

test("CODEX_CODE_MODE_HOST_PATH wins over cache", () => {
  const vendor = vendorHostPath("linux-x64");
  assert.ok(fs.existsSync(vendor), "expected vendored linux-x64 host");
  assert.ok(isElfExecutable(vendor), "vendored host must be ELF");
  const prev = process.env.CODEX_CODE_MODE_HOST_PATH;
  process.env.CODEX_CODE_MODE_HOST_PATH = vendor;
  try {
    const resolved = resolveCodeModeHost("linux-x64");
    assert.strictEqual(resolved.ok, true);
    assert.strictEqual(resolved.src, fs.realpathSync(vendor));
  } finally {
    if (prev === undefined) delete process.env.CODEX_CODE_MODE_HOST_PATH;
    else process.env.CODEX_CODE_MODE_HOST_PATH = prev;
  }
});

test("installCodeModeHost copies Linux ELF into destDir", () => {
  const vendor = vendorHostPath("linux-x64");
  assert.ok(fs.existsSync(vendor), "expected vendored linux-x64 host");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "code-mode-host-install-"));
  const destDir = path.join(tmp, "dest");
  fs.mkdirSync(destDir);
  const prev = process.env.CODEX_CODE_MODE_HOST_PATH;
  process.env.CODEX_CODE_MODE_HOST_PATH = vendor;
  try {
    const result = installCodeModeHost(destDir, "linux-x64");
    assert.strictEqual(result.ok, true);
    assert.ok(fs.existsSync(result.dest));
    assert.ok(isElfExecutable(result.dest));
  } finally {
    if (prev === undefined) delete process.env.CODEX_CODE_MODE_HOST_PATH;
    else process.env.CODEX_CODE_MODE_HOST_PATH = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

console.log("all code-mode-host tests passed");
