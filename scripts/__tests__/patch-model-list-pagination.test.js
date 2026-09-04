#!/usr/bin/env node
/**
 * Unit tests for model-list unlimited (single high-limit) patch transforms.
 */
const assert = require("assert");
const {
  patchQueryInSource,
  patchLookupInSource,
  QUERY_ALREADY,
  LOOKUP_ALREADY,
} = require("../patch-model-list-pagination.js");

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

const UNPATCHED_QUERY =
  "staleTime:de.FIVE_MINUTES,queryFn:()=>Ni(`list-models-for-host`,{hostId:r,includeHidden:!0,cursor:null,limit:a}),select:({data:r})=>Dm({authMethod:t";

const LOOP_QUERY =
  "staleTime:de.FIVE_MINUTES,queryFn:async()=>{let e=[],t=null,n=new Set;do{let i=await Ni(`list-models-for-host`,{hostId:r,includeHidden:!0,cursor:t,limit:a}),o=i.data,s=i.nextCursor;if(s!=null&&n.has(s))throw Error(`repeated model list cursor`);e.push(...o),s!=null&&n.add(s),t=s}while(t!=null);return{data:e}},select:({data:r})=>Dm({authMethod:t";

const UNPATCHED_LOOKUP =
  "try{let{data:n}=await Ql(`list-models-for-host`,{hostId:e,includeHidden:!0,cursor:null,limit:100,priority:`critical`});return t==null?n.find(e=>e.isDefault)??null:n.find(e=>e.model===t||e.id===t)??null}catch(e){";

const LOOP_LOOKUP =
  "try{let n=[],r=null,i=new Set;do{let a=await Ql(`list-models-for-host`,{hostId:e,includeHidden:!0,cursor:r,limit:100,priority:`critical`}),o=a.data,s=a.nextCursor;if(s!=null&&i.has(s))throw Error(`repeated model list cursor`);n.push(...o),s!=null&&i.add(s),r=s}while(r!=null);return t==null?n.find(e=>e.isDefault)??null:n.find(e=>e.model===t||e.id===t)??null}catch(e){";

console.log("patch-model-list-pagination");

test("patches single-page queryFn to high limit", () => {
  const { source, status } = patchQueryInSource(UNPATCHED_QUERY);
  assert.strictEqual(status, "patched");
  assert.match(source, QUERY_ALREADY);
  assert.doesNotMatch(source, /queryFn:async\(\)=>\{let \w+=\[\]/);
  assert.match(
    source,
    /queryFn:\(\)=>Ni\(`list-models-for-host`,\{hostId:r,includeHidden:!0,cursor:null,limit:1e4\}\)/,
  );
});

test("upgrades loop pagination queryFn to high limit", () => {
  const { source, status } = patchQueryInSource(LOOP_QUERY);
  assert.strictEqual(status, "patched");
  assert.match(source, QUERY_ALREADY);
  assert.doesNotMatch(source, /repeated model list cursor/);
});

test("queryFn high-limit is idempotent", () => {
  const once = patchQueryInSource(UNPATCHED_QUERY);
  const twice = patchQueryInSource(once.source);
  assert.strictEqual(twice.status, "already");
  assert.strictEqual(twice.source, once.source);
});

test("patches single-page lookup to high limit", () => {
  const { source, status } = patchLookupInSource(UNPATCHED_LOOKUP);
  assert.strictEqual(status, "patched");
  assert.match(source, LOOKUP_ALREADY);
  assert.match(
    source,
    /let\{data:n\}=await Ql\(`list-models-for-host`,\{hostId:e,includeHidden:!0,cursor:null,limit:1e4,priority:`critical`\}\)/,
  );
});

test("upgrades loop pagination lookup to high limit", () => {
  const { source, status } = patchLookupInSource(LOOP_LOOKUP);
  assert.strictEqual(status, "patched");
  assert.match(source, LOOKUP_ALREADY);
  assert.doesNotMatch(source, /repeated model list cursor/);
});

test("lookup high-limit is idempotent", () => {
  const once = patchLookupInSource(UNPATCHED_LOOKUP);
  const twice = patchLookupInSource(once.source);
  assert.strictEqual(twice.status, "already");
});

const UNPATCHED_V814_QUERY =
  "fPa=100,pPa=[`models`,`list`],mPa=Oo(Q,({limit:a})=>{return{queryFn:()=>Qg(u,n).sendRequest(`model/list`,{includeHidden:!0,cursor:null,limit:a})}})";

const UNPATCHED_V814_LOOKUP =
  "let{data:r}=await Qg(e,t).sendRequest(`model/list`,{includeHidden:!0,cursor:null,limit:100},{priority:`critical`});return n==null?r.find(e=>e.isDefault)??null:r.find(e=>e.model===n||e.id===n)??null";

test("26.814 model/list query + default limit bump to 1e4", () => {
  const { source, status } = patchQueryInSource(`${UNPATCHED_V814_QUERY};pHr=100,mHr=5e3`);
  assert.strictEqual(status, "patched");
  assert.match(source, /fPa=1e4,pPa=\[`models`,`list`\]/);
  assert.match(source, /pHr=1e4,mHr=5e3/);
  assert.match(
    source,
    /sendRequest\(`model\/list`,\{includeHidden:!0,cursor:null,limit:1e4\}/,
  );
});

test("26.814 model/list query is idempotent", () => {
  const once = patchQueryInSource(`${UNPATCHED_V814_QUERY};pHr=100,mHr=5e3`);
  const twice = patchQueryInSource(once.source);
  assert.strictEqual(twice.status, "already");
});

test("26.814 model/list lookup limit bumps via query transform", () => {
  const { source, status } = patchQueryInSource(UNPATCHED_V814_LOOKUP);
  assert.strictEqual(status, "patched");
  assert.match(
    source,
    /sendRequest\(`model\/list`,\{includeHidden:!0,cursor:null,limit:1e4\},\{priority:`critical`\}\)/,
  );
});

const UNPATCHED_V825_HOOK =
  "function XG(e){let t=(0,kga.c)(29),n=e?.hostId??`local`,r=e?.limit??100,i=fO(n);return{queryFn:()=>Nb(d,r).sendRequest(`model/list`,{includeHidden:!0,cursor:null,limit:o})}}";

const UNPATCHED_V825_PAGER = "CDr=100,wDr=5e3";

test("26.825 picker hook default + queryFn limit:o bump to 1e4", () => {
  const { source, status } = patchQueryInSource(`${UNPATCHED_V825_HOOK};${UNPATCHED_V825_PAGER}`);
  assert.strictEqual(status, "patched");
  assert.match(source, /e\?\.limit\?\?1e4/);
  assert.match(source, /CDr=1e4,wDr=5e3/);
  assert.match(
    source,
    /sendRequest\(`model\/list`,\{includeHidden:!0,cursor:null,limit:1e4\}/,
  );
});

test("26.825 picker hook is idempotent", () => {
  const once = patchQueryInSource(`${UNPATCHED_V825_HOOK};${UNPATCHED_V825_PAGER}`);
  const twice = patchQueryInSource(once.source);
  assert.strictEqual(twice.status, "already");
});

console.log("all passed");
