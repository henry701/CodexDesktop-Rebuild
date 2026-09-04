#!/usr/bin/env node
const assert = require("assert");
const { collectPatches, UPDATER_METHODS } = require("../patch-updater.js");
const { parse } = require("acorn");

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

console.log("patch-updater");

test("disables Linux package updater as well as Sparkle/Windows", () => {
  assert.ok(UPDATER_METHODS.has("shouldIncludeLinuxPackageUpdater"));
  const src =
    "x={shouldIncludeSparkle(e,t,n=process.env){return m(e,t,`darwin`,n)},shouldIncludeLinuxPackageUpdater(e,t,n=process.env){return m(e,t,`linux`,n)},shouldIncludeUpdater(e,t,n=process.env){return !1}}";
  const ast = parse(src, { ecmaVersion: "latest", sourceType: "module" });
  const patches = collectPatches(ast, src);
  const ids = patches.map((p) => p.id).sort();
  assert.deepStrictEqual(ids, ["shouldIncludeLinuxPackageUpdater", "shouldIncludeSparkle"]);
  let next = src;
  for (const p of [...patches].sort((a, b) => b.start - a.start)) {
    next = next.slice(0, p.start) + p.replacement + next.slice(p.end);
  }
  assert.match(next, /shouldIncludeLinuxPackageUpdater\(e,t,n=process\.env\)\{return !1\}/);
  assert.match(next, /shouldIncludeSparkle\(e,t,n=process\.env\)\{return !1\}/);
});

test("already-disabled updater methods are skipped", () => {
  const src =
    "x={shouldIncludeLinuxPackageUpdater(e,t){return !1},shouldIncludeUpdater(e,t){return !1}}";
  const ast = parse(src, { ecmaVersion: "latest", sourceType: "module" });
  assert.deepStrictEqual(collectPatches(ast, src), []);
});

console.log("all passed");
