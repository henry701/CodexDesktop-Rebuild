#!/usr/bin/env node
/**
 * Unit tests: official Linux ChatGPT should cold-start in ChatGPT, not Codex.
 */
const assert = require("assert");
const {
  patchSource,
  DETAIL_MODE_TO,
} = require("../patch-default-chatgpt-mode.js");

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

const UNPATCHED = [
  "Xje={conversationDetailMode:Pu({agentAccess:`read-write`,default:`STEPS_COMMANDS`,description:`How much turn detail Codex shows`,key:`conversationDetailMode`,schema:gl([`STEPS_PROSE`,`STEPS_COMMANDS`,`STEPS_EXECUTION`])})}",
  "function wXt(e){return e===`STEPS_EXECUTION`?AXt:e??`STEPS_COMMANDS`}function TXt(e,t){",
  "nG=Za(Q,({get:e})=>TQa({chatGptFeatureAccessStatus:e(cy),persistedMode:e(OQa),settingsLoading:e(zQo),windowType:`electron`,workOnlyModeEnabled:e(CXt),workModeAllowed:e(qv).status===`allowed`,workModeEnabled:e(ry)})),Za(Q,({get:e})=>TQa({chatGptFeatureAccessStatus:e(cy),persistedMode:e(DQa)??kd(EQa,`work`),settingsLoading:e(zQo),windowType:`electron`,workOnlyModeEnabled:e(CXt),workModeAllowed:e(qv).status===`allowed`,workModeEnabled:e(ry)}))",
  "hAe=gl([`chat`,`work`,`codex`]),gAe=ll({codexAppMode:hAe.optional()})",
  "codex:{id:`sidebarElectron.productMode.codex`,defaultMessage:`Codex`}",
].join(";");

console.log("patch-default-chatgpt-mode");

test("cold-start conversationDetailMode is STEPS_PROSE (ChatGPT)", () => {
  const { source, applied } = patchSource(UNPATCHED);
  assert.ok(applied.includes("conversationDetailMode-default"));
  assert.ok(source.includes(DETAIL_MODE_TO));
  assert.doesNotMatch(
    source,
    /default:`STEPS_COMMANDS`,description:`How much turn detail Codex shows`,key:`conversationDetailMode`/,
  );
});

test("wXt unset fallback is STEPS_PROSE", () => {
  const { source, applied } = patchSource(UNPATCHED);
  assert.ok(applied.includes("wXt-fallback"));
  assert.match(source, /e===\`STEPS_EXECUTION\`\?\w+:e\?\?`STEPS_PROSE`/);
  assert.doesNotMatch(source, /e\?\?`STEPS_COMMANDS`/);
});

test("composer persisted-mode fallback is chat, not work", () => {
  const { source, applied } = patchSource(UNPATCHED);
  assert.ok(applied.includes("composer-persisted-fallback"));
  assert.match(source, /persistedMode:e\(\w+\)\?\?kd\(\w+,`chat`\)/);
  assert.doesNotMatch(source, /persistedMode:e\(\w+\)\?\?kd\(\w+,`work`\)/);
});

test("does not remove ChatGPT or Codex modes", () => {
  const { source } = patchSource(UNPATCHED);
  assert.match(source, /hAe=gl\(\[`chat`,`work`,`codex`\]\)/);
  assert.match(source, /sidebarElectron\.productMode\.codex/);
});

test("idempotent", () => {
  const once = patchSource(UNPATCHED);
  const twice = patchSource(once.source);
  assert.strictEqual(twice.source, once.source);
  assert.deepStrictEqual(twice.applied, []);
  assert.strictEqual(twice.already, true);
});

test("leaves unrelated STEPS_COMMANDS alone", () => {
  const other = "schema:gl([`STEPS_PROSE`,`STEPS_COMMANDS`,`STEPS_EXECUTION`])";
  const { source, applied } = patchSource(other);
  assert.strictEqual(source, other);
  assert.deepStrictEqual(applied, []);
});

console.log("all passed");
