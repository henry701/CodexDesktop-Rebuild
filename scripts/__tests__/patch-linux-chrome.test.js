#!/usr/bin/env node
const assert = require("assert");
const { patchSource } = require("../patch-linux-chrome.js");

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

console.log("patch-linux-chrome");

const V814_OPAQUE =
  "opaqueWindowsEnabled:t,platform:n}){return t&&!A9(e)&&(n===`darwin`||n===`win32`)}" +
  "function hje({appearance:e,isFocused:t,platform:n}){return!t&&!A9(e)&&n===`darwin`}";

test("26.814 opaque helpers add linux", () => {
  const { patched, applied } = patchSource(V814_OPAQUE, { isCheck: false });
  assert.ok(applied.some((item) => item.id === "linux-opaque-surface-mje" && item.status === "applied"));
  assert.ok(applied.some((item) => item.id === "linux-opaque-surface-hje" && item.status === "applied"));
  assert.match(patched, /!A9\(e\)&&\(n===`darwin`\|\|n===`win32`\|\|n===`linux`\)/);
  assert.match(patched, /!A9\(e\)&&\(n===`darwin`\|\|n===`linux`\)/);
});

const V901_OPAQUE =
  "function TRe({appearance:e,opaqueWindowsEnabled:t,platform:n}){return t&&!L9(e)&&(n===`darwin`||n===`win32`)}" +
  "function ERe({appearance:e,isFocused:t,platform:n}){return!t&&!L9(e)&&n===`darwin`}";

test("26.901 opaque helpers add linux", () => {
  const { patched, applied } = patchSource(V901_OPAQUE, { isCheck: false });
  assert.ok(applied.some((item) => item.status === "applied"));
  assert.match(patched, /!L9\(e\)&&\(n===`darwin`\|\|n===`win32`\|\|n===`linux`\)/);
  assert.match(patched, /!L9\(e\)&&\(n===`darwin`\|\|n===`linux`\)/);
});

test("26.901 Linux titlebar overlay is already upstream", () => {
  const overlay =
    "n===`win32`||n===`linux`?{titleBarStyle:`hidden`,titleBarOverlay:M9(r)}:{titleBarStyle:`default`}";
  const { patched, applied } = patchSource(overlay, { isCheck: false });
  assert.strictEqual(patched, overlay);
  assert.ok(applied.every((item) => item.status !== "applied"));
});

console.log("all patch-linux-chrome tests passed");
