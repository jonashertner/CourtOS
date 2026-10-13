// Narrow windows: the page never scrolls sideways. A single grid column must be
// minmax(0, 1fr), because a bare 1fr grows to its widest content.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");
const media = (query) => {
  const blocks = [];
  for (let at = css.indexOf(`@media (${query})`); at >= 0; at = css.indexOf(`@media (${query})`, at + 1)) {
    let depth = 0, i = css.indexOf("{", at);
    const start = i;
    for (; i < css.length; i++) { if (css[i] === "{") depth++; else if (css[i] === "}" && --depth === 0) break; }
    blocks.push(css.slice(start, i + 1));
  }
  return blocks.join("\n");
};
const escape = (text) => text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
const rule = (block, selector) => new RegExp(`(?:^|[}\\s,])${escape(selector)}\\s*\\{([^}]*)\\}`, "m").exec(block)?.[1] ?? "";

test("the Protection tab puts the page under the register below 1260 pixels, in a column that cannot outgrow the window", () => {
  assert.match(rule(media("max-width: 1260px"), ".privacy"), /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.doesNotMatch(rule(media("max-width: 980px"), ".privacy"), /grid-template-columns:\s*1fr/);
  assert.match(rule(css, ".preview-bar select"), /max-width:\s*min\(260px, 100%\)/);
  assert.match(rule(css, ".page-text"), /overflow-x:\s*hidden/, "a hidden name at the end of a line adds no scrollbar");
});

test("the research column and the document table fit a phone", () => {
  assert.match(rule(media("max-width: 980px"), ".research-grid"), /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(rule(media("max-width: 640px"), "table.docs"), /overflow-x:\s*auto/);
});

test("a party comparison lists the parties one under the other when its columns would be narrower than 160 pixels", async () => {
  const results = await readFile(new URL("../web/results.js", import.meta.url), "utf8");
  assert.match(results, /dataset: \{ cols: String\(Math\.min\(parties\.length, 6\)\) \}/);
  assert.match(css, /\.compare-table \{ container-type: inline-size; \}/);
  for (let n = 1; n <= 5; n++) {
    const width = (n + 1) * 160 + n * 26 - 1;
    const block = new RegExp(`@container \\(max-width: ${width}px\\) \\{ \\[data-cols="${n}"\\] \\.compare-row \\{ grid-template-columns: minmax\\(0, 1fr\\);[^\\n]*\\[data-cols="${n}"\\] \\.cell-party \\{ display: block; \\}`);
    assert.match(css, block, `${n} parties`);
  }
  assert.match(css, /\.compare-table\[data-cols="6"\] \.compare-row \{ grid-template-columns: minmax\(0, 1fr\);/, "six or more always stack");
  assert.match(rule(media("max-width: 980px"), ".q-body, .compare-row"), /grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test("every text colour reads at 4.5:1 or more on paper and on the wash, in both themes", () => {
  const tokens = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/g)].map(m => [m[1], m[2]]));
  const light = tokens(/:root \{([^}]*)\}/.exec(css)[1]);
  const dark = { ...light, ...tokens(/:root\[data-theme="dark"\] \{([^}]*)\}/.exec(css)[1]) };
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [theme, t] of [["light", light], ["dark", dark]]) {
    for (const text of ["ink", "muted", "faint", "local", "external", "alert", "amber"]) {
      for (const ground of ["paper", "wash"]) {
        assert.ok(ratio(t[text], t[ground]) >= 4.5, `${theme}: --${text} on --${ground} is ${ratio(t[text], t[ground]).toFixed(2)}:1`);
      }
    }
  }
});
