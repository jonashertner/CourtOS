import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TRANSLATIONS } from "../web/i18n.js";

const FILES = ["app.js", "shared.js", "results.js", "word.js"].map(f => new URL(`../web/${f}`, import.meta.url));
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
