import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CaseStore } from "../src/caseStore.mjs";
import { detectLanguage, pageLabel } from "../src/language.mjs";
import { freshCase, ORIGINAL_IDENTIFIERS } from "./helpers.mjs";

test("the language of the proceedings is recognised from ordinary text", () => {
  assert.equal(detectLanguage(["Die Klägerin hat mit der Beklagten einen Vertrag geschlossen, der nicht erfüllt wurde. Sie verlangt von der Beklagten den Ersatz des Schadens, der ihr aus der Verspätung entstanden ist, und die Kosten des Verfahrens."]), "de");
  assert.equal(detectLanguage(["La demanderesse a conclu avec la défenderesse un contrat qui n'a pas été exécuté. Elle réclame à la défenderesse la réparation du dommage qui lui a été causé par le retard et les frais de la procédure."]), "fr");
  assert.equal(detectLanguage(["L'attrice ha concluso con la convenuta un contratto che non è stato adempiuto. Essa chiede alla convenuta il risarcimento del danno che le è stato causato dal ritardo e le spese della procedura."]), "it");
  assert.equal(detectLanguage(["The claimant entered into a contract with the respondent which was not performed. It claims from the respondent the damage that was caused by the delay and the costs of the proceedings."]), "en");
  assert.equal(detectLanguage(["Klage"]), null, "too little text to tell");
  assert.equal(pageLabel("S. 3", "fr"), "p. 3");
  assert.equal(pageLabel("Abs. 4–9", "it"), "cpv. 4–9");
});

test("labels follow the language of the proceedings; exhibit codes and consent behave", async () => {
  const { store, cleanup } = await freshCase();
  try {
    assert.deepEqual(store.case.language, { code: "de", source: "detected" });
    const labelOf = (role) => store.sources.find(s => s.role === role && !s.code)?.label;
    assert.equal(labelOf("claim"), "Klage");
    const address = store.register.entities.find(e => e.kind === "address" && e.decision === "replace");
    assert.match(address.replacement, /^Adresse \d+$/);
    await store.release({ model: "demo", budgetChf: null });
    assert.equal(store.consentValid(), true);

    await store.setLanguage("en");
    assert.equal(labelOf("claim"), "Statement of claim");
    assert.equal(labelOf("response"), "Statement of defence");
    assert.ok(store.sources.some(s => s.label === "KB 2"), "exhibit codes stay as the parties wrote them");
    assert.equal(store.register.entities.find(e => e.id === address.id).replacement, address.replacement.replace("Adresse", "Address"));
    const claim = store.mirror.documents.find(d => d.label === "Statement of claim");
    assert.equal(claim.pages[0].label, "p. 1");
    assert.equal(store.consentValid(), false, "a new language changes the anonymised version");
    assert.deepEqual(store.issues, []);
    const mirror = JSON.stringify(store.mirror);
    for (const identifier of ORIGINAL_IDENTIFIERS) assert.equal(mirror.includes(identifier), false, `mirror leaks ${identifier}`);

    await store.setLanguage("de");
    assert.equal(labelOf("claim"), "Klage");
    assert.equal(store.register.entities.find(e => e.id === address.id).replacement, address.replacement);
    await assert.rejects(store.setLanguage("xx"), { code: "invalid_language" });
  } finally { await cleanup(); }
});

test("a French case gets French labels and replacement labels from the start", async () => {
  const dir = await mkdtemp(join(tmpdir(), "courtos-fr-"));
  const root = join(dir, "C.2026.12");
  try {
    await mkdir(join(root, "Pièces"), { recursive: true });
    await writeFile(join(root, "Demande.md"), [
      "Tribunal de première instance",
      "Demande",
      "Monsieur Jean Dupont, numéro AVS 756.9876.5432.10, domicilié à la rue du Lac 12, 1003 Lausanne, demandeur, contre la société Lémanique Construction SA, défenderesse.",
      "Le demandeur a conclu avec la défenderesse un contrat d'entreprise pour la rénovation de sa maison. Les travaux n'ont pas été achevés dans le délai convenu et il réclame des dommages-intérêts pour le retard qui lui a été causé.",
    ].join("\n\n"));
    await writeFile(join(root, "Pièces", "pièce 1.md"), "Contrat d'entreprise entre Jean Dupont et Lémanique Construction SA. Le prix est fixé à CHF 240'000. Les travaux doivent être terminés pour la fin de l'année.");
    const store = await CaseStore.open(root);
    await store.scan();
    try {
      assert.equal(store.case.language.code, "fr");
      assert.ok(store.sources.some(s => s.label === "Demande"));
      assert.ok(store.sources.some(s => s.label === "pièce 1"));
      const ahv = store.register.entities.find(e => e.aliases.some(a => a.includes("756.9876.5432.10")));
      assert.ok(ahv, "the AVS number is in the register");
      assert.match(ahv.replacement, /^AVS \d+$/);
      const mirror = JSON.stringify(store.mirror);
      assert.equal(mirror.includes("756.9876.5432.10"), false);
      assert.equal(mirror.includes("Dupont"), false);
    } finally { store.close(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("anonymisation fails safe on OCR words, sentence openers and later evidence", async () => {
  const { suggestAnonymisation } = await import("../src/anonymise.mjs");
  const { mergeDetections, emptyRegister } = await import("../src/register.mjs");
  const ocrPage = { n: 1, has_text: true, ocr: { engine: "test" }, text: "Aktennotiz vom 3. März 2025.\n\nHerr Bucher hat die Besichtigung abgelehnt. Herr Bucher war nicht erreichbar." };
  const first = suggestAnonymisation([{ id: "D1", label: "BB 9", pages: [ocrPage] }]);
  const bucher = first.candidates.find(c => c.aliases.some(a => /Bucher/.test(a)));
  assert.ok(bucher, "Bucher is suggested");
  assert.equal(bucher.decision, "replace", "a surname that is also a damaged word is still replaced");

  // A kept suggestion becomes "replace" when a later scan shows it identifies someone,
  // unless a person decided to keep it.
  let register = emptyRegister();
  register = mergeDetections(register, [{ kind: "person", label: "Gross", aliases: ["Gross"], count: 1, samples: [], notes: ["check_word"], decision: "keep" }], "Gross ist das Haus.");
  assert.equal(register.entities[0].decision, "keep");
  register = mergeDetections(register, [{ kind: "person", label: "Gross", aliases: ["Gross"], count: 2, samples: [], notes: [], decision: "replace" }], "Gross ist das Haus. Zeuge Peter Gross.");
  assert.equal(register.entities[0].decision, "replace");
});
