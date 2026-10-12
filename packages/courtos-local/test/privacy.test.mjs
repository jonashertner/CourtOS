import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { systemPrompt, TASKS, tools } from "../src/agent/tasks.mjs";
import { CaseStore } from "../src/caseStore.mjs";
import { SAMPLES } from "../src/samples.mjs";

const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));
const MODEL_WORDS = { de: "Datum und Ort sind unbestritten.", fr: "Pour autant que la Date et le Montant soient établis, le Lieu importe peu.", it: "Novembre: il Datore di lavoro conferma.", en: "May the Item be noted." };
// English words outside the vocabulary that the files capitalise ("German", "Report") still
// count as names in what the model writes: English proceedings need an English vocabulary.
const strings = (value) => typeof value === "string" ? [value] : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];

for (const sample of SAMPLES.filter(s => !s.offline)) {
  test(`${sample.id}: no planted identifier reaches the mirror, no page is blocked, and a run's requests pass the guard`, async () => {
    const spec = JSON.parse(await readFile(join(FIXTURES, "samples", `${sample.id}.json`), "utf8"));
    const work = await mkdtemp(join(tmpdir(), "courtos-privacy-"));
    const store = await CaseStore.open(join(FIXTURES, sample.folder), { work });
    try {
      await store.scan();
      const pages = store.mirror.documents.flatMap(d => [{ where: `${d.id} label`, text: d.label }, ...d.pages.filter(p => p.text).map(p => ({ where: `${d.id} p${p.n}`, text: p.text }))]);
      // Health data is a special category, but no identifier: "a surgical operation" names
      // nobody once the patient is replaced. CourtOS does not rewrite it.
      for (const [kind, list] of Object.entries(spec.planted).filter(([kind]) => kind !== "health")) for (const planted of list) {
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${planted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`, "iu");
        const left = pages.filter(p => pattern.test(p.text)).map(p => p.where);
        assert.deepEqual(left, [], `${kind} «${planted}» left in the mirror`);
      }
      assert.deepEqual(store.issues, [], "every page is released");
      // CourtOS's own instructions, and ordinary words the model writes, pass the guard.
      const guard = store.guard();
      for (const task of Object.keys(TASKS)) {
        const system = systemPrompt(task, sample.language, sample.language);
        for (const text of [system, ...strings(tools(task))]) guard.allow(text);
        assert.ok(guard.checkBody({ system, tools: tools(task), messages: [{ role: "user", content: "Start with list_documents." }, { role: "assistant", content: [{ type: "text", text: MODEL_WORDS[sample.language] }] }] }));
      }
    } finally {
      store.close();
      await rm(work, { recursive: true, force: true });
    }
  });
}
