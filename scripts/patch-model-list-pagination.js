#!/usr/bin/env node
/**
 * Paginate model/list past upstream's single-page limit (100 models).
 * Required for large codex-shim catalogs in the Desktop model picker.
 *
 * Supports upstream bundle layouts:
 *   - 26.602.x: model-queries-*.js + read-service-tier-*.js
 *   - 26.623+: shared webpack chunks (Zc / $l call sites)
 *
 * Usage:
 *   node scripts/patch-model-list-pagination.js [platform]
 *   node scripts/patch-model-list-pagination.js --check
 *   PATCH_ASAR_ROOT=/tmp/extracted node scripts/patch-model-list-pagination.js
 */
const fs = require("fs");
const path = require("path");
const { relPath, SRC_DIR } = require("./patch-util");

const RULES = [
  {
    id: "602-model-queries-list",
    needle:
      "queryFn:()=>i(`list-models-for-host`,{hostId:a,includeHidden:!0,cursor:null,limit:s})",
    replacement:
      "queryFn:async()=>{let e=[],t=null,n=new Set;do{let r=await i(`list-models-for-host`,{hostId:a,includeHidden:!0,cursor:t,limit:s}),o=r.data,c=r.nextCursor;if(c!=null&&n.has(c))throw Error(`repeated model list cursor`);e.push(...o),c!=null&&n.add(c),t=c}while(t!=null);return{data:e}}",
    group: "query",
  },
  {
    id: "623-model-query-list",
    needle:
      "queryFn:()=>Zc(`list-models-for-host`,{hostId:r,includeHidden:!0,cursor:null,limit:a})",
    replacement:
      "queryFn:async()=>{let e=[],t=null,n=new Set;do{let i=await Zc(`list-models-for-host`,{hostId:r,includeHidden:!0,cursor:t,limit:a}),o=i.data,s=i.nextCursor;if(s!=null&&n.has(s))throw Error(`repeated model list cursor`);e.push(...o),s!=null&&n.add(s),t=s}while(t!=null);return{data:e}}",
    group: "query",
  },
  {
    id: "602-model-lookup",
    needle:
      "let{data:r}=await t(`list-models-for-host`,{hostId:e,includeHidden:!0,cursor:null,limit:100});return n==null?r.find(e=>e.isDefault)??null:r.find(e=>e.model===n||e.id===n)??null",
    replacement:
      "let r=[],i=null,a=new Set;do{let o=await t(`list-models-for-host`,{hostId:e,includeHidden:!0,cursor:i,limit:100}),s=o.data,c=o.nextCursor;if(c!=null&&a.has(c))throw Error(`repeated model list cursor`);r.push(...s),c!=null&&a.add(c),i=c}while(i!=null);return n==null?r.find(e=>e.isDefault)??null:r.find(e=>e.model===n||e.id===n)??null",
    group: "lookup",
  },
  {
    id: "623-model-lookup",
    needle:
      "let{data:n}=await $l(`list-models-for-host`,{hostId:e,includeHidden:!0,cursor:null,limit:100});return t==null?n.find(e=>e.isDefault)??null:n.find(e=>e.model===t||e.id===t)??null",
    replacement:
      "let n=[],r=null,i=new Set;do{let a=await $l(`list-models-for-host`,{hostId:e,includeHidden:!0,cursor:r,limit:100}),o=a.data,s=a.nextCursor;if(s!=null&&i.has(s))throw Error(`repeated model list cursor`);n.push(...o),s!=null&&i.add(s),r=s}while(r!=null);return t==null?n.find(e=>e.isDefault)??null:n.find(e=>e.model===t||e.id===t)??null",
    group: "lookup",
  },
];

function assetsDir(platform, customRoot) {
  if (customRoot) {
    return path.join(customRoot, "src", "webview", "assets");
  }
  return path.join(SRC_DIR, platform, "_asar", "webview", "assets");
}

function findAssetFilesByNeedle(dir, needle) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(dir, f))
    .filter((filePath) => fs.readFileSync(filePath, "utf8").includes(needle));
}

function replaceOnce(source, needle, replacement) {
  if (source.includes(replacement)) return { source, changed: false, status: "already" };
  const count = source.split(needle).length - 1;
  if (count === 0) return { source, changed: false, status: "missing" };
  if (count !== 1) return { source, changed: false, status: "ambiguous" };
  return { source: source.replace(needle, replacement), changed: true, status: "patched" };
}

function patchFile(bundlePath, rule, dryRun) {
  const source = fs.readFileSync(bundlePath, "utf8");
  const result = replaceOnce(source, rule.needle, rule.replacement);
  if (result.status === "missing") {
    return { ok: false, status: "missing" };
  }
  if (result.status === "ambiguous") {
    console.log(`  [!] ${relPath(bundlePath)}: ${rule.id} needle matched more than once`);
    return { ok: false, status: "ambiguous" };
  }
  if (result.status === "already") {
    console.log(`  [ok] ${relPath(bundlePath)}: ${rule.id} already applied`);
    return { ok: true, status: "already", group: rule.group };
  }
  if (dryRun) {
    console.log(`  [?] ${relPath(bundlePath)}: would patch (${rule.id})`);
    return { ok: true, status: "would-patch", group: rule.group };
  }
  fs.writeFileSync(bundlePath, result.source, "utf8");
  console.log(`  [ok] ${relPath(bundlePath)}: patched (${rule.id})`);
  return { ok: true, status: "patched", group: rule.group };
}

function patchRuleInDir(dir, rule, dryRun) {
  const files = findAssetFilesByNeedle(dir, rule.needle);
  if (files.length === 0) {
    const already = findAssetFilesByNeedle(dir, rule.replacement);
    if (already.length > 0) {
      for (const filePath of already) {
        console.log(`  [ok] ${relPath(filePath)}: ${rule.id} already applied`);
      }
      return { ok: true, status: "already", group: rule.group };
    }
    return { ok: false, status: "missing" };
  }
  if (files.length > 1) {
    console.log(`  [!] ${rule.id}: needle matched ${files.length} bundles`);
    return { ok: false, status: "ambiguous" };
  }
  return { ...patchFile(files[0], rule, dryRun), group: rule.group };
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

  const groupHits = { query: false, lookup: false };

  for (const rule of RULES) {
    const result = patchRuleInDir(dir, rule, dryRun);
    if (result.ok) {
      groupHits[rule.group] = true;
    } else if (result.status !== "missing") {
      process.exit(1);
    }
  }

  if (!groupHits.query) {
    console.error("[x] model list query pagination: no matching upstream bundle (602 or 623 layout)");
    process.exit(1);
  }
  if (!groupHits.lookup) {
    console.log("[skip] model lookup pagination: needle not found (non-fatal)");
  }
}

main();
