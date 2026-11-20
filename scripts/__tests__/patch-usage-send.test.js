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

// 26.1117: the gate moved to a standalone per-host atom; the two minified
// composer copies read it as the last submitDisabledReasons array element.
const V1117 =
  'nZ=(0,i._U)(L.o,nH),' +
  'rm=null!=tK&&(n4||(n2.settings.model===b.qz?rp!==tK.model:n2.settings.model!==tK.model)||null!=tK.reasoningEffort&&n2.settings.reasoning_effort!==tK.reasoningEffort),' +
  'e5[171]!==nZ?(eJ=[rP,rR,rk,rj,rD,rO,rN,rF,rH,nZ].filter(Boolean),e5[171]=nZ,e5[172]=eJ):eJ=e5[172];' +
  'let rV=eJ.join(",");';

const V1117_COPY =
  'nW=(0,i._U)(P.o,n$),' +
  'og=null!=tG&&(n5||(n2.settings.model===C.qz?oh!==tG.model:n2.settings.model!==tG.model)||null!=tG.reasoningEffort&&n2.settings.reasoning_effort!==tG.reasoningEffort),' +
  'e3[171]!==nW?(eY=[oA,oS,oU,oL,oB,oE,oN,oD,o$,nW].filter(Boolean),e3[171]=nW,e3[172]=eY):eY=e3[172];' +
  'let oO=eY.join(",");';

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

test("gates the 26.1117 composer join on the selected model", () => {
  const { source, status } = patchInSource(V1117);
  assert.strictEqual(status, "patched");
  assert.match(
    source,
    /let rV=function\(e\)\{return!e\|\|\/\^\(\?:codex-\|gpt-\)\|\(\?:\^o\\d\)\/\.test\(e\)\}\(\(null!=tK&&tK\.model\)\|\|\(null!=n2&&n2\.settings\.model\)\|\|""\)\?eJ\.join\(","\):eJ\.filter\(function\(e\)\{return e!==nZ\}\)\.join\(","\)/,
  );
  assert.match(source, /rm=null!=tK&&\(n4\|\|\(n2\.settings\.model===b\.qz/);
});

test("keeps the second 26.1117 composer copy", () => {
  const { source, status } = patchInSource(V1117_COPY);
  assert.strictEqual(status, "patched");
  assert.match(
    source,
    /let oO=function\(e\).*\(\(null!=tG&&tG\.model\)\|\|\(null!=n2&&n2\.settings\.model\)\|\|""\)\?eY\.join\(","\):eY\.filter\(function\(e\)\{return e!==nW\}\)\.join\(","\)/,
  );
});

test("is idempotent", () => {
  const once = patchInSource(V1106);
  const twice = patchInSource(once.source);
  assert.strictEqual(twice.status, "already");
  assert.ok(twice.source.includes(ALREADY));
});

test("26.1117 pass is idempotent", () => {
  const once = patchInSource(V1117);
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
