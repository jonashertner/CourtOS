import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentRun } from "../src/agent/runner.mjs";
import { demoProvider } from "../src/agent/demo.mjs";
import { ScriptedProvider } from "../src/agent/providers.mjs";
import { freshCase } from "./helpers.mjs";

// shared.js sets the page language on load; a bare stand-in is enough here.
globalThis.document ??= { documentElement: {} };
const { BUILD, partyName, plainText, sources } = await import("../web/word-doc.js");
const { setLang } = await import("../web/shared.js");
setLang("de"); // the language of the proceedings in the fixture

async function demoRun(store, task) {
  await store.release({ model: "claude-opus-5-5", budgetChf: null });
  const run = new AgentRun({ store, provider: new ScriptedProvider(demoProvider(store, task).turns), task, model: "claude-opus-5-5" });
  await run.run();
  const summary = run.summary();
  assert.equal(summary.status, "succeeded", JSON.stringify(summary.error));
  return summary;
}

test("an inserted table names the parties by their role, binds page numbers and fills the text width", async () => {
  const { store, cleanup } = await freshCase();
  try {
    const state = { case: { parties: store.partiesView() } };
    for (const task of ["chronology", "facts_evidence"]) {
      const spec = BUILD[task](await demoRun(store, task), state);
      assert.equal(spec.kind, "table");
      assert.equal(Math.round(spec.columns.reduce((n, c) => n + c.width, 0) * 100), 100, `${task}: the columns fill the width`);
      const partyColumn = spec.columns.findIndex(c => c.head === "Partei");
      const parties = new Set(spec.rows.map(r => r[partyColumn].text));
      // The fixture's parties have no gender yet, so both forms are given ("Klägerin/Kläger").
      assert.ok([...parties].every(p => /^(Klägerin|Beklagte)(\/|$)/.test(p)), `${task}: parties as a court names them: ${[...parties]}`);
      const cells = JSON.stringify(spec.rows);
      assert.equal(/\bP\d\b/.test(cells), false, "no internal party ids in the document");
      assert.ok(cells.includes("S. 1"), "page number bound to its abbreviation");
      assert.equal(/S\. \d/.test(cells), false);
      assert.ok(plainText(spec).split("\n").length === spec.rows.length + 1);
    }
    const chronology = BUILD.chronology(await demoRun(store, "chronology"), state);
    assert.ok(chronology.rows.every(r => r[1].sub), "the posture goes on a second line under the party");
    assert.ok(chronology.rows.every(r => /^\p{Lu}/u.test(r[1].sub)), "each line in a cell starts with a capital");
  } finally { await cleanup(); }
});

test("two parties in the same role are numbered; an unknown party keeps its id", () => {
  const state = { case: { parties: [
    { id: "P1", role: "claimant", term: "Klägerin" },
    { id: "P2", role: "respondent", term: "Beklagte" },
    { id: "P3", role: "respondent", term: "Beklagte" },
  ] } };
  assert.deepEqual(["P1", "P2", "P3", "P9"].map(id => partyName(state, id)), ["Klägerin", "Beklagte 1", "Beklagte 2", "P9"]);
  assert.equal(sources({ citations: [{ label: "KB 1", page_label: "S. 3" }, { label: "KB 1", page_label: "S. 3" }] }), "KB 1, S. 3");
});

test("a draft goes in as headings and paragraphs, its proposals numbered, sources as notes", async () => {
  const { store, cleanup } = await freshCase();
  try {
    const run = await demoRun(store, "chronology");
    // A draft shaped from the chronology's verified claims.
    const claims = run.result.claims;
    const draft = { result: { claims, rows: [
      { part: "facts", claim: claims[0].id }, { part: "disposition", claim: claims[1].id }, { part: "disposition", claim: claims[2].id },
    ] } };
    const spec = BUILD.decision_draft(draft, {});
    assert.equal(spec.kind, "outline");
    assert.deepEqual(spec.blocks.map(b => b.heading ?? b.number ?? "p"), ["Sachverhalt", "p", "Vorschläge zum weiteren Vorgehen", 1, 2]);
    assert.ok(spec.blocks.filter(b => !b.heading).every(b => b.note), "each paragraph carries its sources");
  } finally { await cleanup(); }
});
