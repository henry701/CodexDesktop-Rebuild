#!/usr/bin/env node
/**
 * Unit tests for shim model-picker allowlist transforms.
 */
const assert = require("assert");
const { patchPicker, patchSidebar } = require("../patch-shim-model-picker.js");

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

const V814 =
  "a&&!r&&t!==`amazonBedrock`?n.has(i.model):!i.hidden;i.useHiddenModels&&r!==`amazonBedrock`?i.availableModels.has(e.model):!e.hidden";

const V825 =
  "return e?.has(a.model)===!0||a.model!==`codex-auto-review`&&(r&&!a.hidden||(o&&!i&&t!==`amazonBedrock`?n.has(a.model):!a.hidden))};a.useHiddenModels&&i!==`amazonBedrock`?a.availableModels.has(e.model):!e.hidden";

const SIDEBAR_V825 =
  "getCompatibleThreadSortKey(this.recentConversationSortKey),modelProviders:null,archived:!1,sourceKinds:Mht";

console.log("patch-shim-model-picker");

test("26.814 allowlist needles force-off hidden filter", () => {
  const { source, status } = patchPicker(V814);
  assert.strictEqual(status, "patched");
  assert.match(source, /!1\?n\.has\(i\.model\):!i\.hidden/);
  assert.match(source, /!1\?i\.availableModels\.has\(e\.model\):!e\.hidden/);
});

test("26.825 allowlist needles force-off hidden filter", () => {
  const { source, status } = patchPicker(V825);
  assert.strictEqual(status, "patched");
  assert.match(source, /!1\?n\.has\(a\.model\):!a\.hidden/);
  assert.match(source, /!1\?a\.availableModels\.has\(e\.model\):!e\.hidden/);
  assert.doesNotMatch(source, /o&&!i&&t!==`amazonBedrock`\?n\.has\(a\.model\)/);
});

test("26.825 allowlist is idempotent", () => {
  const once = patchPicker(V825);
  const twice = patchPicker(once.source);
  assert.strictEqual(twice.status, "already");
});

test("26.825 sidebar modelProviders null → []", () => {
  const { source, status } = patchSidebar(SIDEBAR_V825);
  assert.strictEqual(status, "patched");
  assert.match(source, /modelProviders:\[\],archived:!1,sourceKinds:Mht/);
});

test("renamed-minifier amazonBedrock allowlist still force-off", () => {
  const src =
    "q&&!w&&host!==`amazonBedrock`?allow.has(row.model):!row.hidden;cfg.useHiddenModels&&prov!==`amazonBedrock`?cfg.availableModels.has(e.model):!e.hidden";
  const { source, status } = patchPicker(src);
  assert.strictEqual(status, "patched");
  assert.match(source, /!1\?allow\.has\(row\.model\):!row\.hidden/);
  assert.match(source, /!1\?cfg\.availableModels\.has\(e\.model\):!e\.hidden/);
});

console.log("all passed");
