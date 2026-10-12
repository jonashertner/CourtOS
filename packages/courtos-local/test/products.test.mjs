import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { AgentRun } from "../src/agent/runner.mjs";
import { demoProvider } from "../src/agent/demo.mjs";
import { ScriptedProvider } from "../src/agent/providers.mjs";
import { CaseStore } from "../src/caseStore.mjs";
import { outlineDocx, resultMarkdown, writeProducts } from "../src/products.mjs";
import { BUILD } from "../web/word-doc.js";
import { FIXTURE, freshCase, originalHashes } from "./helpers.mjs";

async function chronologyRun(store) {
  await store.release({ model: "claude-opus-5-5", budgetChf: null });
  const run = new AgentRun({ store, provider: new ScriptedProvider(demoProvider(store, "chronology").turns), task: "chronology", model: "claude-opus-5-5" });
  await run.run();
  const summary = run.summary();
  assert.equal(summary.status, "succeeded", JSON.stringify(summary.error));
  return summary;
}

/** An assessment built from the chronology's claims, enough to typeset. */
function draftOf(run) {
  const [a, b, c] = run.result.claims.map(x => x.id);
  return { ...run, id: `${run.id}-draft`, task: "decision_draft", result: { ...run.result, rows: [
    { id: "R1", part: "facts", claim: a, status: "disputed" },
    { id: "R2", part: "reasoning", claim: b, status: "analysis" },
    { id: "R3", part: "disposition", claim: c, status: "proposal" },
  ] } };
}

const view = (store) => ({ case: { parties: store.partiesView() } });

test("each verified run becomes a file in the work folder, once, with its quotations and in its language", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "courtos-products-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, "Akten", "HG.2026.57 Alpenblick");
  await cp(FIXTURE, source, { recursive: true });
  const before = await originalHashes(source);
  const work = join(dir, "CourtOS", "HG.2026.57 Alpenblick");
  const store = await CaseStore.open(source, { work });
  t.after(() => store.close());
  await store.scan();
  const run = await chronologyRun(store);

  const written = await writeProducts(store, [run], view(store));
  const day = new Date(run.finished).toLocaleDateString("sv-SE");
  assert.deepEqual(written, [`${day} Chronologie.md`]);
  const markdown = await readFile(join(work, "Arbeitsprodukte", written[0]), "utf8");
  assert.match(markdown, /^# Chronologie\n/);
  assert.match(markdown, /> «.+» — Klage, S\. \d/, "each statement keeps the quotation it rests on");
  assert.ok(markdown.includes("Anna Keller"), "the file is for the judge: real names, on this computer only");
  assert.deepEqual(await originalHashes(source), before, "nothing is written next to the originals");

  assert.deepEqual(await writeProducts(store, [run], view(store)), [], "a run is written once");
  await rm(join(work, "Arbeitsprodukte", written[0]));
  assert.deepEqual(await writeProducts(store, [run], view(store)), [], "a file the judge deleted is not brought back");

  const french = resultMarkdown({ ...run, language: "fr" }, view(store), "fr");
  assert.ok(french.includes("Somme de contrôle du résultat"), "the frame is in the language of the text");
  assert.ok(!french.includes("Prüfsumme"));
});

test("the assessment also becomes a Word document: headings, numbered proposals, sources as footnotes", async (t) => {
  const { store, cleanup } = await freshCase();
  t.after(cleanup);
  const draft = draftOf(await chronologyRun(store));
  const written = await writeProducts(store, [draft], view(store));
  assert.equal(written.length, 2);
  const docxName = written.find(name => name.endsWith(".docx"));
  assert.match(docxName, /^\d{4}-\d{2}-\d{2} Würdigung und weiteres Vorgehen\.docx$/);

  const parts = unzipSync(await readFile(join(store.work, "Arbeitsprodukte", docxName)));
  for (const part of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/settings.xml", "word/footnotes.xml", "word/_rels/document.xml.rels"]) assert.ok(parts[part], part);
  const document = strFromU8(parts["word/document.xml"]);
  const footnotes = strFromU8(parts["word/footnotes.xml"]);
  assert.equal((document.match(/<w:footnoteReference /g) ?? []).length, 3, "each paragraph's sources are one footnote");
  assert.equal((footnotes.match(/<w:footnote w:id="\d+">/g) ?? []).length, 3);
  assert.match(footnotes, /Klage, S\. \d+\.<\/w:t>/, "a footnote ends with a full stop, the page bound to its abbreviation");
  assert.match(document, /<w:pStyle w:val="Numbered"\/><\/w:pPr><w:r><w:t xml:space="preserve">1\.\t/);
  assert.match(document, /<w:b\/><\/w:rPr><w:t xml:space="preserve">Strittig: /, "a disputed fact says so");
  assert.match(strFromU8(parts["word/styles.xml"]), /<w:lang w:val="de-CH"\/>/);
  assert.match(strFromU8(parts["word/settings.xml"]), /<w:autoHyphenation\/>/);
});

test("text that would break the document is escaped", () => {
  const parts = unzipSync(outlineDocx({ blocks: [{ heading: "A & B <C>" }, { text: "«x» \u0001 & y", note: "KB 1, S. 2" }] }, { title: "T", subtitle: null, lang: "fr" }));
  const document = strFromU8(parts["word/document.xml"]);
  assert.ok(document.includes("A &amp; B &lt;C&gt;"));
  assert.ok(!document.includes("\u0001"), "control characters are dropped");
  assert.match(strFromU8(parts["word/styles.xml"]), /fr-CH/);
});

test("in the originals' folder, the work products are never read as case documents, and a folder of that name stays the case's own", async (t) => {
  const { store, root, cleanup } = await freshCase();
  t.after(cleanup);
  await mkdir(join(root, "Arbeitsprodukte"));
  await writeFile(join(root, "Arbeitsprodukte", "Notiz.md"), "Eine Akte, die zufällig in einem Ordner dieses Namens liegt.");
  await store.scan();
  const documents = store.sources.filter(s => !s.missing).length;
  const run = await chronologyRun(store);
  await writeProducts(store, [run], view(store));
  assert.equal(store.case.products_dir, "Arbeitsprodukte (CourtOS)", "the folder that was there is not taken over");
  assert.ok((await readdir(join(root, "Arbeitsprodukte (CourtOS)"))).some(name => name.endsWith("Chronologie.md")));
  await store.scan();
  assert.equal(store.sources.filter(s => !s.missing).length, documents, "the products are not read back as documents");
  assert.ok(store.sources.some(s => s.rel_path === "Arbeitsprodukte/Notiz.md"), "the folder that was there is still read");
});

test("the Word pane and the document mark a disputed fact in the assessment", async () => {
  const run = { task: "decision_draft", result: { claims: [{ id: "C1", text: "x", display: { text: "Der Mangel wurde am 3. Mai gerügt." }, citations: [] }], rows: [{ id: "R1", part: "facts", claim: "C1", status: "working_assumption" }, { id: "R2", part: "disposition", claim: "C1", status: "proposal" }] } };
  const blocks = BUILD.decision_draft(run, { case: { parties: [] } }).blocks;
  assert.equal(blocks[1].lead, "Arbeitsannahme");
  assert.equal(blocks[3].lead, null);
  assert.equal(blocks[3].number, 1);
});
