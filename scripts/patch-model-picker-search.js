#!/usr/bin/env node
/**
 * Post-build patch: add a search field to Desktop model pickers.
 *
 * Injects a React child that owns its own hooks so React-Compiler cache
 * slots in the minified parents stay valid. Surfaces:
 *   1. Click picker 250px model scroller (OUc rows)
 *   2. Advanced Model flyout (z_c → options.map(B_c))
 *   3. /models slash submenu (yFa + closeAutocomplete)
 *
 * Search chrome is shown only when the unfiltered list has >= 8 items.
 *
 * Usage:
 *   node scripts/patch-model-picker-search.js [platform]
 *   node scripts/patch-model-picker-search.js --check
 *   PATCH_ASAR_ROOT=/tmp/extracted node scripts/patch-model-picker-search.js
 */
const fs = require("fs");
const path = require("path");
const { relPath, SRC_DIR, parsePlatformArg, existingAsarPlatforms } = require("./patch-util");

const ID = "[$A-Za-z_][\\w$]*";

function re(source) {
  return new RegExp(source);
}

const HELPER_ALREADY = /function cdrModelPickerSearch\(/;

const HELPER_SOURCE = [
  "var cdrModelPickerSearchReact;",
  "function cdrModelPickerSearchText(e){if(e==null||typeof e==`string`)return e??``;let t=[e.searchText,e.displayName,e.model,e.modelLabel,e.description,e.title,e.id,e.slug,typeof e.label==`string`?e.label:``,e.key];return t.filter(Boolean).join(` `)}",
  "function cdrModelPickerSearchFocus(e,t){let n=e.closest(`[data-cdr-model-search]`);if(n==null)return!1;let r=Array.from(n.querySelectorAll(`input,[role=\"menuitem\"],[role=\"menuitemcheckbox\"],[role=\"menuitemradio\"],button[type=\"button\"]`)).filter(e=>e.getAttribute(`aria-disabled`)!==`true`&&!e.hasAttribute(`data-disabled`)),i=r.indexOf(e),a=t===`next`?r[i+1]:r[i-1];return a==null?!1:(a.focus(),!0)}",
  "function cdrModelPickerSearchKeyDown(e,t,n){let r=e.key;if(r===`ArrowDown`||r===`ArrowUp`){cdrModelPickerSearchFocus(e.currentTarget,r===`ArrowDown`?`next`:`previous`)&&(e.preventDefault(),e.stopPropagation());return}if(r===`Escape`){if(t){e.preventDefault(),e.stopPropagation(),n(``);return}return}if(r===`Enter`){let i=e.currentTarget.closest(`[data-cdr-model-search]`)?.querySelector(`[role=\"menuitem\"]:not([data-disabled]),button[type=\"button\"]`);i!=null&&(e.preventDefault(),e.stopPropagation(),i.click())}}",
  "function cdrModelPickerSearch(e){let n=cdrModelPickerSearchReact??(cdrModelPickerSearchReact=r(s(),1)),a=e.jsx,o=e.items??[],c=e.getText??cdrModelPickerSearchText,l=e.renderItem,u=e.empty,d=e.placeholder??`Search models`,f=e.listClassName??`vertical-scroll-fade-mask flex max-h-[250px] flex-col overflow-y-auto`,p=e.minItems??8,[m,h]=n.useState(``),g=o.length>=p,_=m.trim().toLowerCase(),v=g&&_?o.filter(e=>c(e).toLowerCase().includes(_)):o;if(!g)return a.jsx(`div`,{className:f,children:o.map(e=>l(e))});let y=a.jsx(`input`,{value:m,onChange:e=>h(e.currentTarget.value),onKeyDown:e=>cdrModelPickerSearchKeyDown(e,m,h),placeholder:d,spellCheck:!1,autoFocus:!0,className:`w-full appearance-none rounded-lg border border-primary-outline bg-transparent px-2 py-1 text-sm text-default placeholder:text-tertiary`}),b=v.length>0?v.map(e=>l(e)):u??a.jsx(`div`,{className:`px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-tertiary`,children:`No models found`});return a.jsxs(`div`,{className:`flex min-h-0 w-full flex-col`,\"data-cdr-model-search\":``,children:[a.jsx(`div`,{className:`sticky top-0 z-10 bg-surface-elevated-secondary px-[var(--padding-row-x)] py-[var(--padding-row-y)]`,children:y}),a.jsx(`div`,{className:f,children:b})]})}",
  "function cdrModelPickerSearchSlash(e){let n=cdrModelPickerSearchReact??(cdrModelPickerSearchReact=r(s(),1)),[t,i]=n.useState(``),a=e.jsx,o=e.sections??[],c=0;for(let e of o)c+=e.items?.length??0;let l=e.submenu===!0&&c>=(e.minItems??8),u=t.trim().toLowerCase(),d=o;if(l&&u){d=o.map(e=>{let t=e.items.filter(e=>cdrModelPickerSearchText(e).toLowerCase().includes(u));return t.length===e.items.length?e:{...e,items:t}}).filter(e=>e.items.length>0||e.emptyState!=null)}let f=a.jsx(e.Menu,{isActive:e.isActive,isHomeMenu:e.isHomeMenu,noResults:e.noResults,onHighlight:e.onHighlight,onRequestClose:e.onRequestClose,placement:e.placement,onSelect:e.onSelect,query:e.query,sections:d});if(!l)return f;let p=a.jsx(`input`,{value:t,onChange:e=>i(e.currentTarget.value),onKeyDown:e=>cdrModelPickerSearchKeyDown(e,t,i),placeholder:e.placeholder??`Search models`,spellCheck:!1,autoFocus:!0,className:`w-full appearance-none rounded-lg border border-primary-outline bg-transparent px-2 py-1 text-sm text-default placeholder:text-tertiary`});return a.jsxs(`div`,{className:`flex min-h-0 w-full flex-col`,\"data-cdr-model-search\":``,children:[a.jsx(`div`,{className:`sticky top-0 z-10 bg-surface-elevated-secondary px-[var(--padding-row-x)] py-[var(--padding-row-y)]`,children:p}),f]})}",
].join("");

/** Insert helper before the z_c-style submenu function (compiler cache size 12). */
const HELPER_INSERT_RE = re(
  `function ${ID}\\(e\\)\\{let ${ID}=\\(0,${ID}\\.c\\)\\(12\\),\\{submenu:${ID}\\}=e`,
);

const CLICK_SCROLL_RE = re(
  `(\\(0,(${ID})\\.jsx\\)\\((${ID}),\\{keepOpenOnSelect:r,modelOption:e,selectedModel:f,selectedReasoningEffort:E,selectedServiceTier:L,selectedServiceTierIconKind:n\\?null:R,stripGptPrefix:n,onSelect:\\(e,t\\)=>\\{b\\(e,t\\),r\\|\\|y\\?\\.\\(\\)\\}\\},e\\.model\\)\\)[\\s\\S]{0,1200}?)(\\(0,\\2\\.jsx\\)\\(\`div\`,\\{className:\`vertical-scroll-fade-mask flex max-h-\\[250px\\] flex-col overflow-y-auto\`,children:${ID}\\}\\))`,
);

const ZC_CHILDREN_RE = re(
  `l=n\\.options\\.map\\((${ID})\\),t\\[\\d+\\]=n\\.options,t\\[\\d+\\]=l\\);let ${ID};return t\\[\\d+\\]!==n\\.ariaLabel[\\s\\S]{0,500}?(u=\\(0,(${ID})\\.jsx\\)\\((${ID}),\\{ariaLabel:r,contentClassName:i,disabled:a,flyoutHeader:o,label:s,value:c,children:)l(\\})`,
);

const OPTIONS_SEARCHTEXT_RE = re(
  `id:e\\.model,label:\\(0,(${ID})\\.jsx\\)\\((${ID}),\\{model:e\\.model,displayName:e\\.displayName,stripGptPrefix:!0\\}`,
);

const OPTIONS_SEARCHTEXT_ALREADY =
  "id:e.model,searchText:`${e.displayName??``} ${e.model} ${e.description??``}`,label:";

const SLASH_ITEM_RE = re(
  `content:\\(0,(${ID})\\.jsx\\)\\((${ID}),\\{item:e,query:u\\}\\),disabled:e\\.disabled,key:e\\.id\\}`,
);

const SLASH_ITEM_ALREADY = "searchText:cdrModelPickerSearchText(e)";

const SLASH_YFA_RE = re(
  `\\(0,(${ID})\\.jsx\\)\\((${ID}),\\{isActive:l,isHomeMenu:a,noResults:g,onHighlight:_,onRequestClose:n\\.closeAutocomplete,placement:o,onSelect:v,query:u,sections:y\\}`,
);

const SLASH_YFA_ALREADY = "cdrModelPickerSearchSlash,{jsx:";

function replaceOnce(source, pattern, build) {
  const matches = [...source.matchAll(new RegExp(pattern.source, "g"))];
  if (matches.length === 0) return { source, status: "missing" };
  if (matches.length > 1) return { source, status: "ambiguous", count: matches.length };
  const m = matches[0];
  const replacement = build(m);
  return {
    source: source.slice(0, m.index) + replacement + source.slice(m.index + m[0].length),
    status: "patched",
  };
}

function injectHelper(source) {
  if (HELPER_ALREADY.test(source)) return { source, status: "already" };
  const matches = [...source.matchAll(new RegExp(HELPER_INSERT_RE.source, "g"))];
  if (matches.length === 0) return { source, status: "missing" };
  if (matches.length > 1) return { source, status: "ambiguous", count: matches.length };
  const m = matches[0];
  return {
    source: source.slice(0, m.index) + HELPER_SOURCE + source.slice(m.index),
    status: "patched",
  };
}

function patchClickScroll(source) {
  if (source.includes("cdrModelPickerSearch,{jsx:") && source.includes("items:m??[]")) {
    return { source, status: "already" };
  }
  return replaceOnce(source, CLICK_SCROLL_RE, (m) => {
    const prefix = m[1];
    const jsx = m[2];
    const item = m[3];
    return (
      prefix +
      `(0,${jsx}.jsx)(cdrModelPickerSearch,{jsx:${jsx},items:m??[],renderItem:e=>(0,${jsx}.jsx)(${item},{keepOpenOnSelect:r,modelOption:e,selectedModel:f,selectedReasoningEffort:E,selectedServiceTier:L,selectedServiceTierIconKind:n?null:R,stripGptPrefix:n,onSelect:(e,t)=>{b(e,t),r||y?.()}},e.model)})`
    );
  });
}

function patchZcChildren(source) {
  if (/children:\(0,\w+\.jsx\)\(cdrModelPickerSearch,\{jsx:\w+,items:n\.options,renderItem:/.test(source)) {
    return { source, status: "already" };
  }
  return replaceOnce(source, ZC_CHILDREN_RE, (m) => {
    const prefix = m[0].slice(0, m[0].length - m[5].length - 1);
    const renderItem = m[1];
    const jsx = m[3];
    return `${prefix}(0,${jsx}.jsx)(cdrModelPickerSearch,{jsx:${jsx},items:n.options,renderItem:${renderItem}})${m[5]}`;
  });
}

function patchOptionsSearchText(source) {
  if (source.includes(OPTIONS_SEARCHTEXT_ALREADY)) return { source, status: "already" };
  return replaceOnce(
    source,
    OPTIONS_SEARCHTEXT_RE,
    (m) =>
      `id:e.model,searchText:\`\${e.displayName??\`\`} \${e.model} \${e.description??\`\`}\`,label:(0,${m[1]}.jsx)(${m[2]},{model:e.model,displayName:e.displayName,stripGptPrefix:!0}`,
  );
}

function patchSlashItems(source) {
  if (source.includes(SLASH_ITEM_ALREADY)) return { source, status: "already" };
  return replaceOnce(
    source,
    SLASH_ITEM_RE,
    (m) =>
      `content:(0,${m[1]}.jsx)(${m[2]},{item:e,query:u}),disabled:e.disabled,key:e.id,searchText:cdrModelPickerSearchText(e)}`,
  );
}

function patchSlashYfa(source) {
  if (source.includes(SLASH_YFA_ALREADY)) return { source, status: "already" };
  return replaceOnce(
    source,
    SLASH_YFA_RE,
    (m) =>
      `(0,${m[1]}.jsx)(cdrModelPickerSearchSlash,{jsx:${m[1]},Menu:${m[2]},isActive:l,isHomeMenu:a,noResults:g,onHighlight:_,onRequestClose:n.closeAutocomplete,placement:o,onSelect:v,query:u,sections:y,submenu:h}`,
  );
}

function allSurfacesAlready(source) {
  return (
    HELPER_ALREADY.test(source) &&
    source.includes("items:m??[]") &&
    /items:n\.options,renderItem:/.test(source) &&
    source.includes(OPTIONS_SEARCHTEXT_ALREADY) &&
    source.includes(SLASH_ITEM_ALREADY) &&
    source.includes(SLASH_YFA_ALREADY)
  );
}

function patchInSource(source) {
  if (allSurfacesAlready(source)) return { source, status: "already" };

  let next = source;
  let changed = false;
  const steps = [
    injectHelper,
    patchClickScroll,
    patchZcChildren,
    patchOptionsSearchText,
    patchSlashItems,
    patchSlashYfa,
  ];

  for (const step of steps) {
    const result = step(next);
    if (result.status === "ambiguous") return result;
    if (result.status === "patched") {
      next = result.source;
      changed = true;
    }
  }

  if (changed) return { source: next, status: "patched" };
  if (HELPER_ALREADY.test(next) && allSurfacesAlready(next)) {
    return { source: next, status: "already" };
  }
  return { source, status: "missing" };
}

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

function applyInDir(dir, dryRun) {
  let hit = false;
  for (const filePath of listJsFiles(dir)) {
    const source = fs.readFileSync(filePath, "utf8");
    if (
      !source.includes("vertical-scroll-fade-mask flex max-h-[250px]") &&
      !source.includes("onRequestClose:n.closeAutocomplete") &&
      !source.includes("n.options.map")
    ) {
      continue;
    }
    const result = patchInSource(source);
    if (result.status === "missing") continue;
    if (result.status === "ambiguous") {
      console.log(`  [!] ${relPath(filePath)}: model-picker-search matched ${result.count} times`);
      process.exit(1);
    }
    hit = true;
    if (result.status === "already") {
      console.log(`  [ok] ${relPath(filePath)}: model-picker-search already applied`);
      continue;
    }
    if (dryRun) {
      console.log(`  [?] ${relPath(filePath)}: would patch (model-picker-search)`);
      continue;
    }
    fs.writeFileSync(filePath, result.source, "utf8");
    console.log(`  [ok] ${relPath(filePath)}: patched (model-picker-search)`);
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

  const hit = applyInDir(dir, dryRun);
  if (!hit) {
    console.error("[x] model-picker-search: no matching upstream bundle");
    process.exit(1);
  }
}

module.exports = {
  HELPER_ALREADY,
  HELPER_SOURCE,
  patchInSource,
};

if (require.main === module) {
  main();
}
