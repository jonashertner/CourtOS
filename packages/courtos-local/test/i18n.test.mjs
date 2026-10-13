import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TRANSLATIONS } from "../web/i18n.js";

const FILES = [...["app.js", "shared.js", "results.js", "word.js", "word-doc.js"].map(f => new URL(`../web/${f}`, import.meta.url)), new URL("../src/products.mjs", import.meta.url)];
const STRING = String.raw`"((?:[^"\\\n]|\\.)*)"`;
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",");

function literalSources() {
  const found = new Set();
  for (const file of FILES) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(new RegExp(String.raw`\btr\(\s*` + STRING, "g"))) found.add(JSON.parse(`"${m[1]}"`));
    for (const m of src.matchAll(new RegExp(String.raw`\btrn\([^"]*?,\s*` + STRING + String.raw`\s*,\s*` + STRING, "g"))) {
      found.add(JSON.parse(`"${m[1]}"`)); found.add(JSON.parse(`"${m[2]}"`));
    }
  }
  return [...found];
}

test("every literal interface string is translated into French, Italian and English", () => {
  const sources = literalSources();
  assert.ok(sources.length > 200, "the extractor finds the interface strings");
  for (const lang of ["fr", "it", "en"]) {
    const missing = sources.filter(s => !(s in TRANSLATIONS[lang]));
    assert.deepEqual(missing, [], `${lang} is missing translations`);
  }
});

test("translations keep their placeholders", () => {
  for (const [lang, table] of Object.entries(TRANSLATIONS)) {
    for (const [source, text] of Object.entries(table)) {
      assert.equal(placeholders(text), placeholders(source), `${lang}: ${source}`);
    }
  }
});

test("no translation shows German document labels as an example", () => {
  for (const lang of ["fr", "it", "en"]) {
    const german = Object.entries(TRANSLATIONS[lang]).filter(([, text]) => /\b(?:Klage|KB \d)\b/.test(text)).map(([source]) => source);
    assert.deepEqual(german, [], `${lang} names German labels`);
  }
});

test("a native DOM call never receives a null, which it would write as the text \"null\"", () => {
  const offenders = [];
  for (const file of FILES.filter(f => f.pathname.includes("/web/"))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\.(?:replaceChildren|append|prepend|before|after)\(/g)) {
      // The top-level arguments of the call; nulls inside h(…) are dropped by h itself.
      let depth = 1, i = m.index + m[0].length, arg = "";
      const args = [];
      for (; i < src.length && depth; i++) {
        const c = src[i];
        if ("([{".includes(c)) depth++;
        if (")]}".includes(c)) depth--;
        if (depth === 1 && c === ",") { args.push(arg); arg = ""; } else if (depth) arg += c;
      }
      args.push(arg);
      if (args.some(a => /:\s*null\s*$|^\s*null\s*$/.test(a))) offenders.push(`${file.pathname.split("/").pop()}: ${src.slice(m.index, m.index + 60)}`);
    }
  }
  assert.deepEqual(offenders, []);
});
