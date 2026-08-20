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
const { relPath, SRC_DIR, parsePlatformArg, existingAsarPlatforms } = require("./patch-util");

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

/** 26.814+: `model/list` RPC (hostId is implicit on the client). */
const QUERY_MODEL_LIST_ALREADY = "sendRequest(`model/list`,{includeHidden:!0,cursor:null,limit:1e4}";
const QUERY_MODEL_LIST_RE = re(
  `sendRequest\\(\`model/list\`,\\{includeHidden:!0,cursor:null,limit:(?!${HIGH_LIMIT})[^}]+\\}`,
);
const QUERY_MODEL_LIST_ALT_RE = re(
  `sendRequest\\(\`model/list\`,\\{cursor:null,includeHidden:!0,limit:(?!${HIGH_LIMIT})[^}]+\\}`,
);
const QUERY_MODEL_LIST_ALT_ALREADY =
  "sendRequest(`model/list`,{cursor:null,includeHidden:!0,limit:1e4}";
const DEFAULT_LIMIT_FROM = "fPa=100,pPa=[`models`,`list`]";
const DEFAULT_LIMIT_TO = `fPa=${HIGH_LIMIT},pPa=[\`models\`,\`list\`]`;
const PAGER_LIMIT_FROM = "pHr=100,mHr=5e3";
const PAGER_LIMIT_TO = `pHr=${HIGH_LIMIT},mHr=5e3`;

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
  let next = source;
  let changed = false;

  if (next.includes(DEFAULT_LIMIT_FROM)) {
    next = next.replace(DEFAULT_LIMIT_FROM, DEFAULT_LIMIT_TO);
    changed = true;
  }
  if (next.includes(PAGER_LIMIT_FROM)) {
    next = next.replace(PAGER_LIMIT_FROM, PAGER_LIMIT_TO);
    changed = true;
  }
  if (QUERY_MODEL_LIST_RE.test(next)) {
    next = next.replace(new RegExp(QUERY_MODEL_LIST_RE.source, "g"), QUERY_MODEL_LIST_ALREADY);
    changed = true;
  }
  if (QUERY_MODEL_LIST_ALT_RE.test(next)) {
    next = next.replace(new RegExp(QUERY_MODEL_LIST_ALT_RE.source, "g"), QUERY_MODEL_LIST_ALT_ALREADY);
    changed = true;
  }

  if (QUERY_ALREADY.test(next) && !changed) return { source: next, status: "already" };
  if (
    !changed &&
    next.includes(DEFAULT_LIMIT_TO) &&
    next.includes(QUERY_MODEL_LIST_ALREADY)
  ) {
    return { source: next, status: "already" };
  }

  const fromLoop = replaceOnce(next, QUERY_LOOP_RE, (m) => buildQueryReplacement(m[1], m[2]));
  if (fromLoop) {
    if (fromLoop.status === "ambiguous") return fromLoop;
    return fromLoop;
  }

  const fromSingle = replaceOnce(next, QUERY_RE, (m) => buildQueryReplacement(m[1], m[2]));
  if (fromSingle) {
    if (fromSingle.status === "ambiguous") return fromSingle;
    return fromSingle;
  }

  if (changed) return { source: next, status: "patched" };
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
    if (
      !source.includes("list-models-for-host") &&
      !source.includes("model/list") &&
      !source.includes(DEFAULT_LIMIT_FROM) &&
      !source.includes(DEFAULT_LIMIT_TO)
    ) {
      continue;
    }
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
  const platform = parsePlatformArg(args) || existingAsarPlatforms()[0] || "linux-x64";
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
  QUERY_MODEL_LIST_ALREADY,
  DEFAULT_LIMIT_TO,
  patchQueryInSource,
  patchLookupInSource,
};

if (require.main === module) {
  main();
}
