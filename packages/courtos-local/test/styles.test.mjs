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
const rule = (block, selector) => new RegExp(`(?:^|[}\\s,])${selector.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`, "m").exec(block)?.[1] ?? "";

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
