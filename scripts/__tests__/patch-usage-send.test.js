#!/usr/bin/env node
const assert = require("assert");
const { patchInSource, ALREADY } = require("../patch-usage-send.js");

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

const V1106 =
  'aC=null!=tz&&(n7||(n4.settings.model===N.qz?af!==tz.model:n4.settings.model!==tz.model)||null!=tz.reasoningEffort),' +
  'aT=(0,l.Ul)("local"===nF&&I.U);' +
  'aW=nz&&"reserve-limit",aK=aT&&"usage-limit"';

const V1106_COPY =
  'of=null!=t$&&(n9||(n6.settings.model===C.qz?ov!==t$.model:n6.settings.model!==t$.model)||null!=t$.reasoningEffort),' +
  'ow=(0,i.Ul)("local"===nW&&P.U);' +
  'oz=n$&&"reserve-limit",oQ=ow&&"usage-limit"';

console.log("patch-usage-send");

test("gates usage and reserve limits on the selected model", () => {
  const { source, status } = patchInSource(V1106);
  assert.strictEqual(status, "patched");
  assert.match(source, /aT&&function\(e\)\{return!e\|\|\/\^\(\?:codex-\|gpt-\)\|\(\?:\^o\\d\)\/\.test\(e\)\}\(\(null!=tz&&tz\.model\)\|\|n4\.settings\.model\|\|""\)&&"usage-limit"/);
  assert.match(source, /nz&&function\(e\)\{return!e/);
  assert.match(source, /n4\.settings\.model/);
});

test("keeps the second minified composer copy", () => {
  const { source, status } = patchInSource(V1106_COPY);
  assert.strictEqual(status, "patched");
  assert.match(source, /oQ=ow&&function\(e\).*t\$\.model.*n6\.settings\.model.*&&"usage-limit"/);
});

test("is idempotent", () => {
  const once = patchInSource(V1106);
  const twice = patchInSource(once.source);
  assert.strictEqual(twice.status, "already");
  assert.ok(twice.source.includes(ALREADY));
});

test("leaves unrelated usage-limit strings alone", () => {
  const src = 'banner:"usage-limit"';
  const { status } = patchInSource(src);
  assert.strictEqual(status, "missing");
});

console.log("all passed");
