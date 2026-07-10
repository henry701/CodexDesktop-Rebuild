#!/usr/bin/env node
/**
 * Fetch the full model/list in one shot (high limit) instead of upstream's
 * single-page default (100). Required for large codex-shim catalogs in the
 * Desktop model picker.
 *
 * Prefer a single `limit:1e4` call over cursor loops: app-server returns the
 * full page when limit >= catalog size (verified on 26.707), and one request
 * matches "unlimited list at once" UX.
 *
 * Also upgrades older loop-pagination patches (do/while nextCursor) to the
 * single high-limit form.
 *
 * Uses regex patterns so minified callee/local names can change across
 * upstream drops (26.602 / 26.623 / 26.707+).
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

/** Single-request high limit (covers large BYOK catalogs in one page). */
const HIGH_LIMIT = "1e4";

function re(source) {
  return new RegExp(source);
}

/** Already using high-limit queryFn (idempotent). */
const QUERY_ALREADY = re(
  `queryFn:\\(\\)=>${ID}\\(\`list-models-for-host\`,\\{hostId:${ID},includeHidden:!0,cursor:null,limit:${HIGH_LIMIT}\\}\\)`,
);

/**
 * Single-page model list query used by the picker (upstream default).
 * Captures: callee, hostId local.
 */
const QUERY_RE = re(
  `queryFn:\\(\\)=>(${ID})\\(\`list-models-for-host\`,\\{hostId:(${ID}),includeHidden:!0,cursor:null,limit:${ID}\\}\\)`,
);

/**
 * Older loop-pagination queryFn (from prior patch versions).
 * Captures: callee, hostId.
 */
const QUERY_LOOP_RE = re(
  `queryFn:async\\(\\)=>\\{let ${ID}=\\[\\],${ID}=null,${ID}=new Set;do\\{let ${ID}=await (${ID})\\(\`list-models-for-host\`,\\{hostId:(${ID}),includeHidden:!0,cursor:${ID},limit:${ID}\\}\\)[\\s\\S]*?return\\{data:${ID}\\}\\}`,
);

/**
 * Single-page model lookup (default / by id).
 * Optional trailing `,priority:\`critical\`` (26.707+).
 * Captures: dataLocal, callee, hostIdArg, prioritySuffix, modelArg.
 */
const LOOKUP_RE = re(
  `let\\{data:(${ID})\\}=await (${ID})\\(\`list-models-for-host\`,\\{hostId:(${ID}),includeHidden:!0,cursor:null,limit:100(,priority:\`critical\`)?\\}\\);return (${ID})==null\\?\\1\\.find\\(\\w+=>\\w+\\.isDefault\\)\\?\\?null:\\1\\.find\\(\\w+=>\\w+\\.model===\\5\\|\\|\\w+\\.id===\\5\\)\\?\\?null`,
);

/**
 * Older loop-pagination lookup.
 * Captures: callee, hostIdArg, prioritySuffix, modelArg.
 */
const LOOKUP_LOOP_RE = re(
  `let ${ID}=\\[\\],${ID}=null,${ID}=new Set;do\\{let ${ID}=await (${ID})\\(\`list-models-for-host\`,\\{hostId:(${ID}),includeHidden:!0,cursor:${ID},limit:100(,priority:\`critical\`)?\\}\\)[\\s\\S]*?return (${ID})==null\\?${ID}\\.find\\(\\w+=>\\w+\\.isDefault\\)\\?\\?null:${ID}\\.find\\(\\w+=>\\w+\\.model===\\4\\|\\|\\w+\\.id===\\4\\)\\?\\?null`,
);

/** Already using high-limit lookup (idempotent). */
const LOOKUP_ALREADY = re(
  `let\\{data:${ID}\\}=await ${ID}\\(\`list-models-for-host\`,\\{hostId:${ID},includeHidden:!0,cursor:null,limit:${HIGH_LIMIT}(?:,priority:\`critical\`)?\\}`,
);

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

function buildQueryReplacement(callee, hostId) {
  return `queryFn:()=>${callee}(\`list-models-for-host\`,{hostId:${hostId},includeHidden:!0,cursor:null,limit:${HIGH_LIMIT}})`;
}

function buildLookupReplacement(dataLocal, callee, hostIdArg, modelArg, prioritySuffix) {
  const priority = prioritySuffix || "";
  return `let{data:${dataLocal}}=await ${callee}(\`list-models-for-host\`,{hostId:${hostIdArg},includeHidden:!0,cursor:null,limit:${HIGH_LIMIT}${priority}});return ${modelArg}==null?${dataLocal}.find(e=>e.isDefault)??null:${dataLocal}.find(e=>e.model===${modelArg}||e.id===${modelArg})??null`;
}

function replaceOnce(source, pattern, build) {
  const matches = [...source.matchAll(new RegExp(pattern.source, "g"))];
  if (matches.length === 0) return null;
  if (matches.length > 1) return { status: "ambiguous", count: matches.length };
  const m = matches[0];
  const replacement = build(m);
  return {
    status: "patched",
    source: source.slice(0, m.index) + replacement + source.slice(m.index + m[0].length),
  };
}

function patchQueryInSource(source) {
  if (QUERY_ALREADY.test(source)) return { source, status: "already" };

  const fromLoop = replaceOnce(source, QUERY_LOOP_RE, (m) => buildQueryReplacement(m[1], m[2]));
  if (fromLoop) {
    if (fromLoop.status === "ambiguous") return fromLoop;
    return fromLoop;
  }

  const fromSingle = replaceOnce(source, QUERY_RE, (m) => buildQueryReplacement(m[1], m[2]));
  if (fromSingle) {
    if (fromSingle.status === "ambiguous") return fromSingle;
    return fromSingle;
  }

  return { source, status: "missing" };
}

function patchLookupInSource(source) {
  if (LOOKUP_ALREADY.test(source)) return { source, status: "already" };

  const fromLoop = replaceOnce(source, LOOKUP_LOOP_RE, (m) =>
    buildLookupReplacement("n", m[1], m[2], m[4], m[3] || ""),
  );
  if (fromLoop) {
    if (fromLoop.status === "ambiguous") return fromLoop;
    return fromLoop;
  }

  const fromSingle = replaceOnce(source, LOOKUP_RE, (m) =>
    buildLookupReplacement(m[1], m[2], m[3], m[5], m[4] || ""),
  );
  if (fromSingle) {
    if (fromSingle.status === "ambiguous") return fromSingle;
    return fromSingle;
  }

  return { source, status: "missing" };
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
    console.error("[x] model list query unlimited: no matching upstream bundle");
    process.exit(1);
  }
  if (!lookupHit) {
    console.log("[skip] model lookup unlimited: needle not found (non-fatal)");
  }
}

module.exports = {
  HIGH_LIMIT,
  QUERY_ALREADY,
  LOOKUP_ALREADY,
  patchQueryInSource,
  patchLookupInSource,
};

if (require.main === module) {
  main();
}
