#!/usr/bin/env node
const assert = require("assert");
const { patchInSource, TALL_SCROLL } = require("../patch-model-picker-height.js");

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

const SHORT =
  "(0,o2.jsx)(`div`,{className:`vertical-scroll-fade-mask flex max-h-[250px] flex-col overflow-y-auto`,children:h})";

console.log("patch-model-picker-height");

test("bumps model scroller max-h from 250px to 480px", () => {
  const { source, status } = patchInSource(SHORT);
  assert.strictEqual(status, "patched");
  assert.match(source, new RegExp(TALL_SCROLL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(source, /max-h-\[250px\] flex-col overflow-y-auto/);
});

test("is idempotent", () => {
  const once = patchInSource(SHORT);
  const twice = patchInSource(once.source);
  assert.strictEqual(twice.status, "already");
});

test("leaves unrelated 250px classes alone", () => {
  const other = "className:`max-h-[250px] overflow-hidden`";
  const { source, status } = patchInSource(other);
  assert.strictEqual(status, "missing");
  assert.strictEqual(source, other);
});

const ITEM_BASE_SMUSHED =
  "itemBase:`outline-hidden flex min-h-[var(--menu-item-height,0px)] items-center justify-center rounded-xl p-[var(--menu-item-padding,var(--padding-row-y)_var(--padding-row-x))] text-sm`";

test("raises Electron menu-item min-height fallback from 0px", () => {
  const { source, status } = patchInSource(ITEM_BASE_SMUSHED);
  assert.strictEqual(status, "patched");
  assert.match(source, /min-h-\[var\(--menu-item-height,2\.25rem\)\]/);
  assert.doesNotMatch(source, /min-h-\[var\(--menu-item-height,0px\)\]/);
});

test("menu-item height fallback is idempotent", () => {
  const once = patchInSource(ITEM_BASE_SMUSHED);
  const twice = patchInSource(once.source);
  assert.strictEqual(twice.status, "already");
});

const ELECTRON_CSS =
  "[data-codex-window-type=electron]{--text-sm:13px;--text-xs:12px;--font-weight-medium:500;background:0 0;overflow:hidden}";

test("gives Electron the browser menu-item padding tokens", () => {
  const { source, status } = patchInSource(ELECTRON_CSS);
  assert.strictEqual(status, "patched");
  assert.match(source, /--menu-item-height:calc\(var\(--spacing\) \* 9\)/);
  assert.match(source, /--menu-item-padding:calc\(var\(--spacing\) \* 2\)/);
});

const CMDK_CSS =
  "._comboboxRow_szifs_2[cmdk-item]{min-height:var(--menu-item-height,0px)!important;padding:var(--menu-item-padding,var(--padding-row-y) var(--padding-row-x))!important}";

test("cmdk item 0px min-height fallback becomes 2.25rem", () => {
  const { source, status } = patchInSource(CMDK_CSS);
  assert.strictEqual(status, "patched");
  assert.match(source, /min-height:var\(--menu-item-height,2\.25rem\)!important/);
});

console.log("all passed");
