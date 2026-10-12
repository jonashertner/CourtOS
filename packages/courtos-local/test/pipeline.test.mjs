import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AgentRun } from "../src/agent/runner.mjs";
import { demoProvider, DEMO_QUESTION } from "../src/agent/demo.mjs";
import { freshCase, ORIGINAL_IDENTIFIERS, originalHashes, PUBLIC_DETAILS } from "./helpers.mjs";
import { ocrEngine } from "../src/ocr.mjs";

async function runTask(store, task, question = "") {
  const provider = demoProvider(store, task);
  provider.delayMs = 0;
  const run = new AgentRun({ store, provider, task, question, model: "demo" });
  await run.run();
  return { run, provider, summary: run.summary() };
}

test("the mirror contains none of the dossier's identifying details", async () => {
  const { store, cleanup } = await freshCase();
  try {
    assert.deepEqual(store.issues, []);
    const mirror = JSON.stringify(store.mirror);
    for (const identifier of ORIGINAL_IDENTIFIERS) assert.equal(mirror.includes(identifier), false, `mirror leaks ${identifier}`);
    assert.deepEqual(store.issues, []);
    // Public office holders and company registry data are listed and replaced by default;
    // the note tells the user why they may choose to keep them.
    for (const detail of PUBLIC_DETAILS) {
      const entity = store.register.entities.find(e => e.aliases.includes(detail));
      assert.ok(entity, `${detail} is listed in the register`);
      assert.equal(entity.decision, "replace", `${detail} is replaced by default`);
      assert.ok(entity.source === "citecheck" || entity.notes.some(n => ["public_office", "public_identifier"].includes(n)), `${detail} carries its reason`);
    }
    // The register is citecheck's: its people come first and carry the engine's name.
    assert.ok(store.register.entities.some(e => e.source === "citecheck" && e.aliases.includes("Anna Keller")));
    assert.equal(store.anonymisationReport.engine, "citecheck");
    // Neutral labels only: no original file name reaches the mirror.
    for (const source of store.sources) assert.equal(mirror.includes(source.name), false);
  } finally { await cleanup(); }
});

test("a scanned page is recognised locally, or reported as unread", async () => {
  const { store, cleanup } = await freshCase();
  try {
    const scan = store.mirror.documents.find(d => d.label === "BB 2");
    assert.equal(scan.pages.length, 1);
    if (await ocrEngine()) {
      assert.ok(scan.pages[0].section, "OCR text becomes a readable section");
      // A word damaged by OCR ("Ruge") is flagged but still replaced: it could be a surname.
      for (const entity of store.register.entities.filter(e => e.notes?.includes("ocr_word"))) assert.equal(entity.decision, "replace");
      await store.release({ model: "demo", budgetChf: null });
      const { summary } = await runTask(store, "facts_evidence");
      assert.equal(summary.status, "succeeded", JSON.stringify(summary.error));
      const row = summary.result.rows.find(r => r.id === "R6");
      assert.equal(row.assessment, "inconclusive", "the recognised scan is used as evidence");
      assert.equal(scan.pages[0].ocr, true);
      assert.doesNotMatch(scan.pages[0].text, /Keller|Bianchi|Bergfeld/, "OCR text is pseudonymised like any other page");
    } else {
      assert.equal(scan.pages[0].section, null);
      assert.equal(scan.pages[0].status, "no_text");
    }
  } finally { await cleanup(); }
});

test("all three tasks run through the loop, the shared validator and the binder", async () => {
  const { root, store, cleanup } = await freshCase();
  try {
    const before = await originalHashes(root);
    await store.release({ model: "demo", budgetChf: null });
    for (const task of ["chronology", "facts_evidence", "source_chat"]) {
      const { summary, provider } = await runTask(store, task, DEMO_QUESTION);
      assert.equal(summary.status, "succeeded", `${task}: ${JSON.stringify(summary.error)}`);
      const claims = summary.result.claims;
      assert.ok(claims.length > 0);
      for (const claim of claims) for (const citation of claim.citations) {
        assert.equal(citation.match, "exact", `${task} ${claim.id}`);
        assert.ok(citation.quote_original.length > 0);
      }
      // Every stored request is exactly what the provider received, and clean.
      const dir = join(store.dir, "runs", summary.id, "requests");
      const files = (await readdir(dir)).sort();
      assert.equal(files.length, provider.calls.length);
      for (const [i, file] of files.entries()) {
        const text = await readFile(join(dir, file), "utf8");
        assert.equal(text, JSON.stringify(provider.calls[i]));
        for (const identifier of ORIGINAL_IDENTIFIERS) assert.equal(text.includes(identifier), false, `${task} request leaks ${identifier}`);
      }
    }
    // Names are restored locally for display.
    const { summary } = await runTask(store, "source_chat", DEMO_QUESTION);
    assert.match(JSON.stringify(summary.result.claims.map(c => c.citations.map(x => x.quote_original))), /Haustechniker/);
    assert.deepEqual(await originalHashes(root), before, "originals must never change");
  } finally { await cleanup(); }
});

test("the chronology demo exercises one rejected submission and its repair", async () => {
  const { store, cleanup } = await freshCase();
  try {
    await store.release({ model: "demo", budgetChf: null });
    const { summary } = await runTask(store, "chronology");
    const rejected = summary.events.filter(e => e.type === "rejected");
    assert.equal(rejected.length, 1);
    assert.match(rejected[0].reason, /^quotation: these quotations occur more than once/);
    assert.equal(summary.status, "succeeded");
  } finally { await cleanup(); }
});

test("a run needs a valid release, and a new file in the folder revokes it", async () => {
  const { root, store, cleanup } = await freshCase();
  try {
    const { summary } = await runTask(store, "source_chat", DEMO_QUESTION);
    assert.equal(summary.status, "failed");
    assert.equal(summary.error.code, "consent_required");
    await store.release({ model: "demo", budgetChf: null });
    assert.equal(store.consentValid(), true);
    await store.scan();
    assert.equal(store.consentValid(), true, "an unchanged rescan keeps the release");
    await writeFile(join(root, "Beilagen", "KB 5 Nachtrag.md"), "Nachtrag: Herr Marco Bianchi bestätigte die Besichtigung vom 10. Februar 2025.\n");
    await store.scan();
    assert.equal(store.consentValid(), false, "changed content revokes the release");
  } finally { await cleanup(); }
});

test("a result turns stale when a file it was made from changes or disappears; new files are listed", async () => {
  const { staleness } = await import("../src/verify.mjs");
  const { rm } = await import("node:fs/promises");
  const { root, store, cleanup } = await freshCase();
  try {
    await store.release({ model: "demo", budgetChf: null });
    const { summary } = await runTask(store, "chronology");
    assert.equal(summary.status, "succeeded");
    assert.deepEqual(staleness(store, summary.result), { stale: false, changed: [], added: [] });

    const cited = store.sources.find(s => s.id === summary.result.claims[0].citations[0].document);
    const literature = store.sources.find(s => s.rel_path.startsWith("Literatur/"));
    await writeFile(join(root, literature.rel_path), "# Notiz\n\nGeänderter Text der Notiz zur Rügefrist.\n");
    await rm(join(root, cited.rel_path));
    await writeFile(join(root, "Replik.md"), "Replik der Klägerin.\n\nDie Klägerin hält an ihren Rechtsbegehren fest.\n");
    await store.scan();
    const fresh = staleness(store, summary.result);
    assert.equal(fresh.stale, true);
    assert.deepEqual(fresh.changed.map(c => [c.document, c.reason]).sort(), [[cited.id, "missing"], [literature.id, "changed"]].sort());
    assert.deepEqual(fresh.added.map(a => store.sources.find(s => s.id === a.document).rel_path), ["Replik.md"]);
    assert.ok(fresh.changed.find(c => c.reason === "missing").pages.length > 0, "every cited page of a missing file is gone");

    // Bytes appended to a PDF change the file but not the cited page text.
    const pdf = store.sources.find(s => s.rel_path.endsWith(".pdf") && summary.result.claims.some(c => c.citations.some(x => x.document === s.id)) && s.id !== cited.id);
    assert.ok(pdf, "the run cites a second PDF");
    {
      await writeFile(join(root, pdf.rel_path), Buffer.concat([await readFile(join(root, pdf.rel_path)), Buffer.from("\n% annotated\n")]));
      await store.scan();
      const entry = staleness(store, summary.result).changed.find(c => c.document === pdf.id);
      assert.equal(entry.reason, "changed");
      assert.deepEqual(entry.pages, [], "the cited passages themselves are unchanged");
    }
  } finally { await cleanup(); }
});
