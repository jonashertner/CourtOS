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
import { listProducts, productPath, resultDocx, resultMarkdown, wordDocument, writeProducts } from "../src/products.mjs";
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
  assert.deepEqual(written, [`${day} Chronologie.md`, `${day} Chronologie.docx`]);
  const markdown = await readFile(join(work, "Arbeitsprodukte", written[0]), "utf8");
  assert.match(markdown, /^# Chronologie\n/);
  assert.match(markdown, /> «.+» — Klage, S\. \d/, "each statement keeps the quotation it rests on");
  assert.ok(markdown.includes("Anna Keller"), "the file is for the judge: real names, on this computer only");
  assert.deepEqual(await originalHashes(source), before, "nothing is written next to the originals");

  assert.deepEqual(await writeProducts(store, [run], view(store)), [], "a run is written once");
  await writeFile(join(work, "Arbeitsprodukte", "Notiz der Richterin.txt"), "x");
  await writeFile(join(work, "Arbeitsprodukte", `~$${day} Chronologie.docx`), "lock");
  const { files } = await listProducts(store);
  assert.deepEqual(files.map(f => f.name).sort(), [...written, "Notiz der Richterin.txt"].sort(), "the judge's own files are listed, Word's lock files are not");
  assert.equal(await productPath(store, written[1]), join(store.work, "Arbeitsprodukte", written[1]));
  for (const name of ["../.courtos/case.json", `~$${day} Chronologie.docx`, "Arbeitsprodukte"]) await assert.rejects(productPath(store, name), { code: "file_not_found" });
  for (const name of written) await rm(join(work, "Arbeitsprodukte", name));
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
  const parts = unzipSync(wordDocument({ kind: "outline", blocks: [{ heading: "A & B <C>" }, { text: "«x» \u0001 & y", note: "KB 1, S. 2" }] }, { title: "T", subtitle: null, lang: "fr" }));
  const document = strFromU8(parts["word/document.xml"]);
  assert.ok(document.includes("A &amp; B &lt;C&gt;"));
  assert.ok(!document.includes("\u0001"), "control characters are dropped");
  assert.match(strFromU8(parts["word/styles.xml"]), /fr-CH/);
});

const xmlOf = (bytes, part = "word/document.xml") => strFromU8(unzipSync(bytes)[part]);

test("a table result becomes a Word table: a header row that repeats, one row per entry, landscape for wide tables", async (t) => {
  const { store, cleanup } = await freshCase();
  t.after(cleanup);
  const run = await chronologyRun(store);
  const document = xmlOf(resultDocx(run, view(store), "de"));
  assert.equal((document.match(/<w:tr>/g) ?? []).length, run.result.rows.length + 1, "a header row and one row per event");
  assert.equal((document.match(/<w:cantSplit\/>/g) ?? []).length, run.result.rows.length + 1, "no row breaks across a page");
  assert.equal((document.match(/<w:tblHeader\/>/g) ?? []).length, 1, "the header row repeats on each page");
  assert.match(document, /<w:pStyle w:val="TableHeading"\/><\/w:pPr><w:r><w:t xml:space="preserve">Datum</);
  assert.match(document, /<w:pgSz w:w="11906" w:h="16838"\/>/, "four columns with one main column fit an upright page");
  const comparison = { kind: "table", columns: [0.15, 0.3, 0.3, 0.25].map((width, i) => ({ head: `H${i}`, width })), rows: [] };
  assert.match(xmlOf(wordDocument(comparison, { title: "T", lang: "de" })), /w:orient="landscape"/, "text in several columns gets the wide page");
  assert.match(document, /Gelesen: \d+ von \d+ Aktenseiten\./, "what was read closes the document");
  assert.match(document, /Prüfsumme des Ergebnisses: [0-9a-f]{64}<\/w:t><\/w:r><\/w:p><w:sectPr>/, "and the body ends with a paragraph, after the table");

  const wide = xmlOf(wordDocument({ kind: "table", columns: [0.2, 0.2, 0.2, 0.2, 0.2].map((width, i) => ({ head: `H${i}`, width })), rows: [[{ text: "a\nb", sub: "s" }, { text: "" }, { text: "c" }, { text: "d" }, { text: "e" }]] }, { title: "T", lang: "de" }));
  assert.match(wide, /<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"\/>/);
  assert.equal((wide.match(/<w:gridCol w:w="2800"\/>/g) ?? []).length, 5, "the column shares divide the landscape text width");
  assert.match(wide, /<w:t xml:space="preserve">a<\/w:t><\/w:r><\/w:p><w:p><w:pPr><w:pStyle w:val="TableText"\/><\/w:pPr><w:r><w:t xml:space="preserve">b</, "a line break in a cell is a new paragraph");
  assert.match(wide, /TableNote"\/><\/w:pPr><w:r><w:t xml:space="preserve">s</);

  const doubtful = structuredClone(run);
  doubtful.result.claims.find(c => c.id === run.result.rows[0].event).citations[0].match = "unresolved";
  assert.match(xmlOf(resultDocx(doubtful, view(store), "de")), /\[prüfen\] /, "a statement not verified at its source says so");
  assert.ok(!xmlOf(resultDocx(run, view(store), "de")).includes("[prüfen]"));
});

test("a question to the files becomes a document with the question and the sourced answers", async (t) => {
  const { store, cleanup } = await freshCase();
  t.after(cleanup);
  const chat = { ...(await chronologyRun(store)), task: "source_chat", question: "Wann wurde der Mangel gerügt?" };
  chat.result = { ...chat.result, rows: chat.result.claims.slice(0, 2).map((c, i) => ({ id: `A${i + 1}`, answer: c.id })) };
  const parts = unzipSync(resultDocx(chat, view(store), "de"));
  const document = strFromU8(parts["word/document.xml"]);
  assert.match(document, /Heading1"\/><\/w:pPr><w:r><w:t xml:space="preserve">«Wann wurde der Mangel gerügt\?»/);
  assert.equal((document.match(/<w:footnoteReference /g) ?? []).length, 2);
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

test("the facts table names each place once", () => {
  const ref = (page) => ({ label: "Klage", page_label: `S. ${page}`, match: "exact" });
  const claims = [["S", [ref(1)]], ["E", [ref(1), ref(2)]], ["O", [ref(2)]], ["W", []]].map(([id, citations]) => ({ id, text: id, citations }));
  const spec = BUILD.facts_evidence({ result: { claims, rows: [{ party: null, statement: "S", evidence: ["E"], opposing: ["O"], reasoning: "W", assessment: "supported" }] } }, { case: { parties: [] } });
  assert.equal(spec.rows[0][4].text, "Klage, S.\u00a01; Klage, S.\u00a02");
});

test("the Word pane and the document mark a disputed fact in the assessment", async () => {
  const run = { task: "decision_draft", result: { claims: [{ id: "C1", text: "x", display: { text: "Der Mangel wurde am 3. Mai gerügt." }, citations: [] }], rows: [{ id: "R1", part: "facts", claim: "C1", status: "working_assumption" }, { id: "R2", part: "disposition", claim: "C1", status: "proposal" }] } };
  const blocks = BUILD.decision_draft(run, { case: { parties: [] } }).blocks;
  assert.equal(blocks[1].lead, "Arbeitsannahme");
  assert.equal(blocks[3].lead, null);
  assert.equal(blocks[3].number, 1);
});
