#!/usr/bin/env node
/**
 * Unit tests for model-picker search ASAR transforms (26.818 needles).
 */
const assert = require("assert");
const {
  HELPER_ALREADY,
  patchInSource,
} = require("../patch-model-picker-search.js");

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

const UNPATCHED_CLICK_SCROLL = [
  "h=m?.map(e=>(0,N4.jsx)(OUc,{keepOpenOnSelect:r,modelOption:e,selectedModel:f,selectedReasoningEffort:E,selectedServiceTier:L,selectedServiceTierIconKind:n?null:R,stripGptPrefix:n,onSelect:(e,t)=>{b(e,t),r||y?.()}},e.model)),t[41]=n,t[42]=r,t[43]=f,t[44]=m,t[45]=y,t[46]=b,t[47]=E,t[48]=L,t[49]=R,t[50]=h):h=t[50];let g;t[51]===h?g=t[52]:(g=(0,N4.jsxs)(N4.Fragment,{children:[p,(0,N4.jsx)(`div`,{className:`vertical-scroll-fade-mask flex max-h-[250px] flex-col overflow-y-auto`,children:h})]}),t[51]=h,t[52]=g),ie=g;",
].join("");

const UNPATCHED_ZC = [
  "function z_c(e){let t=(0,V_c.c)(12),{submenu:n}=e,r=n.ariaLabel,i=n.contentClassName,a=n.disabled,o;t[0]===n.title?o=t[1]:(o=n.title==null?null:(0,Y0.jsx)(bI.Title,{children:n.title}),t[0]=n.title,t[1]=o);let s=n.label,c=n.value,l;t[2]===n.options?l=t[3]:(l=n.options.map(B_c),t[2]=n.options,t[3]=l);let u;return t[4]!==n.ariaLabel||t[5]!==n.contentClassName||t[6]!==n.disabled||t[7]!==n.label||t[8]!==n.value||t[9]!==o||t[10]!==l?(u=(0,Y0.jsx)(mgc,{ariaLabel:r,contentClassName:i,disabled:a,flyoutHeader:o,label:s,value:c,children:l}),t[4]=n.ariaLabel,t[5]=n.contentClassName,t[6]=n.disabled,t[7]=n.label,t[8]=n.value,t[9]=o,t[10]=l,t[11]=u):u=t[11],u}",
].join("");

const UNPATCHED_OPTIONS =
  "options:m?.map(e=>({id:e.model,label:(0,N4.jsx)(X0,{model:e.model,displayName:e.displayName,stripGptPrefix:!0}),onSelect:()=>{b(e.model)},selected:e.model===f}))??[]";

const UNPATCHED_SLASH_ITEMS =
  "items:e.items.map(e=>({content:(0,F1.jsx)(E9s,{item:e,query:u}),disabled:e.disabled,key:e.id}))";

const UNPATCHED_SLASH_YFA =
  "b=(0,F1.jsx)(yFa,{isActive:l,isHomeMenu:a,noResults:g,onHighlight:_,onRequestClose:n.closeAutocomplete,placement:o,onSelect:v,query:u,sections:y}),t[21]=n.closeAutocomplete";

const HOME_YFA =
  "jsx)(yFa,{className:n,chromeVariant:m,isActive:!0,isHomeMenu:h,keyboardEventTarget:d,noResults:v,onHighlight:y,onRequestClose:o,placement:f,onSelect:b,query:p,sections:x})";

const CHATGPT_INTERNAL_SCROLL =
  "(0,e2.jsx)(`div`,{className:`vertical-scroll-fade-mask flex max-h-[250px] flex-col overflow-y-auto`,children:ge.length>0?ge.map(e=>e.title):null})";

function fullUnpatched() {
  return [
    UNPATCHED_ZC,
    UNPATCHED_CLICK_SCROLL,
    UNPATCHED_OPTIONS,
    UNPATCHED_SLASH_ITEMS,
    UNPATCHED_SLASH_YFA,
    HOME_YFA,
    CHATGPT_INTERNAL_SCROLL,
  ].join(";");
}

console.log("patch-model-picker-search");

test("injects helper and patches all three picker surfaces", () => {
  const { source, status } = patchInSource(fullUnpatched());
  assert.strictEqual(status, "patched");
  assert.match(source, HELPER_ALREADY);
  assert.match(source, /function cdrModelPickerSearchSlash\(/);
  assert.match(source, /cdrModelPickerSearch,/);
  assert.match(source, /items:m\?\?\[\]/);
  assert.match(source, /renderItem:B_c/);
  assert.match(source, /searchText:`\$\{e\.displayName\?\?``\} \$\{e\.model\} \$\{e\.description\?\?``\}`/);
  assert.match(source, /searchText:cdrModelPickerSearchText\(e\)/);
  assert.match(source, /cdrModelPickerSearchSlash,\{jsx:F1,Menu:yFa/);
  assert.match(source, /submenu:h/);
});

test("keeps compiler slots for the 250px list", () => {
  const { source } = patchInSource(UNPATCHED_ZC + UNPATCHED_CLICK_SCROLL);
  assert.match(source, /t\[51\]===h\?g=t\[52\]/);
  assert.match(source, /t\[50\]=h\):h=t\[50\]/);
  assert.match(
    source,
    /h=m\?\.map\(e=>\(0,N4\.jsx\)\(OUc,\{keepOpenOnSelect:r,modelOption:e/,
  );
});

test("does not wrap the home-menu yFa or ChatGPT internal search scroller", () => {
  const { source } = patchInSource(fullUnpatched());
  assert.match(source, new RegExp(HOME_YFA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(source, /children:ge\.length>0\?ge\.map/);
  assert.doesNotMatch(
    source,
    /cdrModelPickerSearchSlash,\{jsx:F1,Menu:yFa,className:n/,
  );
});

test("is idempotent", () => {
  const once = patchInSource(fullUnpatched());
  const twice = patchInSource(once.source);
  assert.strictEqual(twice.status, "already");
  assert.strictEqual(twice.source, once.source);
});

test("reports missing when no picker needles exist", () => {
  const { source, status } = patchInSource("function hello(){return 1}");
  assert.strictEqual(status, "missing");
  assert.strictEqual(source, "function hello(){return 1}");
});

test("helper shows search chrome only for 8+ items", () => {
  const vm = require("vm");
  const { HELPER_SOURCE } = require("../patch-model-picker-search.js");
  const sandbox = {
    r: (mod) => mod,
    s: () => ({
      useState(value) {
        return [value, () => {}];
      },
    }),
  };
  vm.runInNewContext(HELPER_SOURCE, sandbox);
  const jsx = {
    jsx(type, props) {
      return { type, props };
    },
    jsxs(type, props) {
      return { type, props };
    },
  };
  const many = Array.from({ length: 8 }, (_, i) => ({ model: `m${i}`, displayName: `Model ${i}` }));
  const few = many.slice(0, 3);
  const renderItem = (item) => ({ type: "item", props: item });
  const withSearch = sandbox.cdrModelPickerSearch({ jsx, items: many, renderItem });
  assert.strictEqual(withSearch.type, "div");
  assert.strictEqual(withSearch.props["data-cdr-model-search"], "");
  assert.strictEqual(withSearch.props.children[0].props.children.type, "input");
  const without = sandbox.cdrModelPickerSearch({ jsx, items: few, renderItem });
  assert.strictEqual(without.props["data-cdr-model-search"], undefined);
  assert.match(without.props.className, /max-h-\[250px\]/);
});

console.log("all passed");
