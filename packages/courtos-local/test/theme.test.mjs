import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// A page's root element and this browser's storage, as far as the theme uses them.
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.document ??= { documentElement: { dataset: {} } };
const { currentTheme, setTheme } = await import("../web/shared.js");

/** Runs theme.js as the page does before drawing, against a fresh root element. */
async function firstPaint(saved) {
  const root = { dataset: {} };
  const storage = { getItem: (k) => (k === "courtos.theme" ? saved : null) };
  vm.runInNewContext(await readFile(new URL("../web/theme.js", import.meta.url), "utf8"), { document: { documentElement: root }, localStorage: storage });
  return root.dataset.theme ?? "light";
}

test("the page is light unless dark was chosen, and the choice is kept", async () => {
  assert.equal(currentTheme(), "light", "light by default");
  assert.equal(await firstPaint(null), "light");
  assert.equal(await firstPaint("something else"), "light");
  assert.equal(await firstPaint("dark"), "dark", "a chosen dark theme applies before the first paint");

  setTheme("dark");
  assert.equal(currentTheme(), "dark");
  assert.equal(store.get("courtos.theme"), "dark");
  assert.equal(await firstPaint(store.get("courtos.theme")), "dark", "and on the next visit");

  setTheme("light");
  assert.equal(currentTheme(), "light");
  assert.equal(store.has("courtos.theme"), false);
});
