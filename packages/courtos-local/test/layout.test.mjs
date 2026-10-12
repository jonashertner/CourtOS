// Highlighting a citation on the original page: positions come from the page
// itself, and an unknown position gives no highlight rather than a guess.
import { test } from "node:test";
import assert from "node:assert/strict";
import { citationRects, pageLayouts, quoteRects } from "../src/layout.mjs";
import { ocrEngine } from "../src/ocr.mjs";
import { freshCase } from "./helpers.mjs";

const word = (t, x, y, w = 0.1, h = 0.02) => ({ t, b: [x, y, w, h] });

test("a quotation is located across runs and lines, ignoring layout whitespace; not found or ambiguous gives no highlight", () => {
  const words = [word("Die Beklagte", 0.1, 0.1, 0.2), word("bestreitet die", 0.3, 0.1, 0.2), word("Rüge.", 0.1, 0.13, 0.1), word("Die Beklagte", 0.1, 0.5, 0.2)];
  const { rects } = quoteRects(words, "Beklagte bestreitet die\nRüge");
  assert.equal(rects.length, 2, "one rectangle per line");
  assert.ok(Math.abs(rects[0].x - (0.1 + 0.2 * 3 / 11)) < 1e-4, "starts inside the first run, after «Die»");
  assert.ok(Math.abs(rects[0].x + rects[0].w - 0.5) < 1e-6, "runs on one line are joined");
  assert.ok(rects[1].w < 0.1, "stops before the full stop");
  assert.deepEqual(quoteRects(words, "nicht auf der Seite"), { rects: [], reason: "not_found" });
  assert.deepEqual(quoteRects(words, "Die Beklagte"), { rects: [], reason: "ambiguous" });
  assert.deepEqual(quoteRects(words, " \n"), { rects: [], reason: "empty" });
});

test("a citation is highlighted on the PDF text layer and, for a scan, on the OCR word boxes", async () => {
  const { store, cleanup } = await freshCase();
  try {
    const layout = pageLayouts();
    const span = (doc, page, phrase) => {
      const chars = Array.from(store.originalPage(doc, page).text), at = Array.from(store.originalPage(doc, page).text.slice(0, store.originalPage(doc, page).text.indexOf(phrase))).length;
      assert.ok(at >= 0 && store.originalPage(doc, page).text.indexOf(phrase) >= 0, `phrase on page: ${phrase}`);
      return { document: doc, page, start: at, end: at + Array.from(phrase).length, chars };
    };
    const klage = store.sources.find(s => s.rel_path.startsWith("01 Klage")).id;
    const text = store.originalPage(klage, 1).text;
    const phrase = text.split("\n").map(l => l.trim()).find(l => l.length > 30 && text.indexOf(l) === text.lastIndexOf(l)).slice(0, 40);
    const out = await citationRects(store, layout, span(klage, 1, phrase));
    assert.equal(out.source, "text");
    assert.ok(out.rects.length >= 1, JSON.stringify(out));
    for (const r of out.rects) for (const v of [r.x, r.y, r.x + r.w, r.y + r.h]) assert.ok(v >= 0 && v <= 1, "inside the page");

    // A page that changed since the citation was checked is not highlighted.
    assert.deepEqual(await citationRects(store, layout, { ...span(klage, 1, phrase), sha256: "0".repeat(64) }), { rects: [], reason: "changed" });
    assert.equal((await citationRects(store, layout, { ...span(klage, 1, phrase), end: 10 ** 6 })).reason, "invalid_span");

    const engine = await ocrEngine();
    const scan = store.sources.find(s => s.rel_path.includes("Scan")).id;
    const page = store.originalPage(scan, 1);
    if (engine?.name === "vision" && page.ocr) {
      const line = page.text.split("\n").map(l => l.trim()).find(l => l.length > 25 && page.text.indexOf(l) === page.text.lastIndexOf(l));
      const scanned = await citationRects(store, layout, span(scan, 1, line));
      assert.equal(scanned.source, "ocr");
      assert.ok(scanned.rects.length >= 1, JSON.stringify(scanned));
    } else if (page.ocr) {
      // Tesseract gives no word boxes here: the position is unknown, so no highlight.
      assert.equal((await citationRects(store, layout, span(scan, 1, page.text.slice(0, 20)))).reason, "no_layout");
    }
  } finally { await cleanup(); }
});
