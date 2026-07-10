#!/usr/bin/env node
/**
 * Paginate model/list past upstream's single-page limit (100 models).
 * Required for large codex-shim catalogs in the Desktop model picker.
 *
 * Uses regex patterns so minified callee/local names can change across
 * upstream drops (26.602 / 26.623 / 26.707+). Prefer structural matches
 * over hard-coded identifier lists.
 *
 * Usage:
 *   node scripts/patch-model-list-pagination.js [platform]
 *   node scripts/patch-model-list-pagination.js --check
 *   PATCH_ASAR_ROOT=/tmp/extracted node scripts/patch-model-list-pagination.js
 */
const fs = require("fs");
const path = require("path");
const { relPath, SRC_DIR } = require("./patch-util");

const ID = "[$A-Za-z_][\\w$]*";

/** Already-paginated queryFn (idempotent). */
const QUERY_ALREADY =
  /queryFn:async\(\)=>\{let \w+=\[\],\w+=null,\w+=new Set;do\{let \w+=await \w+\(`list-models-for-host`/;

/**
 * Single-page model list query used by the picker.
 * Captures: callee, hostId local, limit local.
 */
const QUERY_RE = new RegExp(
  String.raw`queryFn:\(\)=>(${ID})\(\`list-models-for-host\`,\{hostId:(${ID}),includeHidden:!0,cursor:null,limit:(${ID})\}\)`,
);

/**
 * Single-page model lookup (default / by id).
 * Optional trailing `,priority:\`critical\`` (26.707+).
 * Captures: dataLocal, callee, hostIdArg, modelArg.
 */
const LOOKUP_RE = new RegExp(
  String.raw`let\{data:(${ID})\}=await (${ID})\(\`list-models-for-host\`,\{hostId:(${ID}),includeHidden:!0,cursor:null,limit:100(,priority:\`critical\`)?\}\);return (${ID})==null\?\1\.find\(\w+=>\w+\.isDefault\)\?\?null:\1\.find\(\w+=>\w+\.model===\5\|\|\w+\.id===\5\)\?\?null`,
);

/** Already-paginated lookup (idempotent). */
const LOOKUP_ALREADY =
  /do\{let \w+=await \$?\w+\(`list-models-for-host`,\{hostId:\w+,includeHidden:!0,cursor:\w+,limit:100(?:,priority:`critical`)?\}/;

function assetsDir(platform, customRoot) {
  if (customRoot) {
    return path.join(customRoot, "src", "webview", "assets");
  }
  return path.join(SRC_DIR, platform, "_asar", "webview", "assets");
}

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(dir, f));
}

function buildQueryReplacement(callee, hostId, limit) {
  return (
    `queryFn:async()=>{let e=[],t=null,n=new Set;do{let i=await ${callee}(\`list-models-for-host\`,{hostId:${hostId},includeHidden:!0,cursor:t,limit:${limit}}),o=i.data,s=i.nextCursor;if(s!=null&&n.has(s))throw Error(\`repeated model list cursor\`);e.push(...o),s!=null&&n.add(s),t=s}while(t!=null);return{data:e}}`
  );
}

function buildLookupReplacement(callee, hostIdArg, modelArg, prioritySuffix) {
  const priority = prioritySuffix || "";
  return (
    `let n=[],r=null,i=new Set;do{let a=await ${callee}(\`list-models-for-host\`,{hostId:${hostIdArg},includeHidden:!0,cursor:r,limit:100${priority}}),o=a.data,s=a.nextCursor;if(s!=null&&i.has(s))throw Error(\`repeated model list cursor\`);n.push(...o),s!=null&&i.add(s),r=s}while(r!=null);return ${modelArg}==null?n.find(e=>e.isDefault)??null:n.find(e=>e.model===${modelArg}||e.id===${modelArg})??null`
  );
}

function patchQueryInSource(source) {
  if (QUERY_ALREADY.test(source)) return { source, status: "already" };
  const matches = [...source.matchAll(new RegExp(QUERY_RE.source, "g"))];
  if (matches.length === 0) return { source, status: "missing" };
  if (matches.length > 1) return { source, status: "ambiguous", count: matches.length };
  const m = matches[0];
  const replacement = buildQueryReplacement(m[1], m[2], m[3]);
  return {
    source: source.slice(0, m.index) + replacement + source.slice(m.index + m[0].length),
    status: "patched",
  };
}

function patchLookupInSource(source) {
  if (LOOKUP_ALREADY.test(source)) return { source, status: "already" };
  const matches = [...source.matchAll(new RegExp(LOOKUP_RE.source, "g"))];
  if (matches.length === 0) return { source, status: "missing" };
  if (matches.length > 1) return { source, status: "ambiguous", count: matches.length };
  const m = matches[0];
  const replacement = buildLookupReplacement(m[2], m[3], m[5], m[4] || "");
  return {
    source: source.slice(0, m.index) + replacement + source.slice(m.index + m[0].length),
    status: "patched",
  };
}

function applyGroup(dir, group, patchFn, dryRun) {
  let hit = false;
  for (const filePath of listJsFiles(dir)) {
    const source = fs.readFileSync(filePath, "utf8");
    if (!source.includes("list-models-for-host")) continue;
    const result = patchFn(source);
    if (result.status === "missing") continue;
    if (result.status === "ambiguous") {
      console.log(`  [!] ${relPath(filePath)}: ${group} matched ${result.count} times`);
      process.exit(1);
    }
    hit = true;
    if (result.status === "already") {
      console.log(`  [ok] ${relPath(filePath)}: ${group} already applied`);
      continue;
    }
    if (dryRun) {
      console.log(`  [?] ${relPath(filePath)}: would patch (${group})`);
      continue;
    }
    fs.writeFileSync(filePath, result.source, "utf8");
    console.log(`  [ok] ${relPath(filePath)}: patched (${group})`);
  }
  return hit;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--check");
  const platform = args.find((a) => ["mac-arm64", "mac-x64", "win"].includes(a)) || "mac-x64";
  const customRoot = process.env.PATCH_ASAR_ROOT;
  const dir = assetsDir(platform, customRoot);

  if (!fs.existsSync(dir)) {
    console.error(`  [!] assets dir missing: ${dir} — run npm run sync first`);
    process.exit(1);
  }

  const queryHit = applyGroup(dir, "model-list-query", patchQueryInSource, dryRun);
  const lookupHit = applyGroup(dir, "model-lookup", patchLookupInSource, dryRun);

  if (!queryHit) {
    console.error("[x] model list query pagination: no matching upstream bundle");
    process.exit(1);
  }
  if (!lookupHit) {
    console.log("[skip] model lookup pagination: needle not found (non-fatal)");
  }
}

main();
