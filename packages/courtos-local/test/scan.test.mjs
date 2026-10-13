import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, neutralLabels } from "../src/scan.mjs";

test("exhibit codes are read from file names as the parties number them, in every language", () => {
  const code = (path) => { const { kind, ...guess } = classify(path); return guess; };
  assert.deepEqual(code("Beilagen/KB 3 Rechnung.pdf"), { role: "exhibit", party: "P1", code: "KB 3" });
  assert.deepEqual(code("Beilagen/BB 2 Protokoll.pdf"), { role: "exhibit", party: "P2", code: "BB 2" });
  assert.deepEqual(code("Pièces/Pièce 101 Courrier.pdf"), { role: "exhibit", party: null, code: "Pièce 101" });
  assert.deepEqual(code("Allegati/Doc 12 Busta paga.pdf"), { role: "exhibit", party: null, code: "Doc. 12" });
  assert.deepEqual(code("Exhibits/Exhibit 3 Contract.pdf"), { role: "exhibit", party: null, code: "Exhibit 3" }, "a whole word keeps its spelling");
  assert.deepEqual(code("Exhibits/Ex. 4 Invoice.pdf"), { role: "exhibit", party: null, code: "Ex. 4" });
  assert.deepEqual(code("Exhibits/Exhibit C-3 Master Agreement.pdf"), { role: "exhibit", party: "P1", code: "Exhibit C-3" }, "claimant's exhibit");
  assert.deepEqual(code("Exhibits/Exhibit R-12 Minutes.pdf"), { role: "exhibit", party: "P2", code: "Exhibit R-12" }, "respondent's exhibit");
});

test("a file name written decomposed (e and accent apart) is read as the same name", () => {
  const name = "Pièces/Pièce 4 Contrat.pdf";
  assert.deepEqual(classify(name.normalize("NFD")), classify(name));
  assert.equal(classify(name.normalize("NFD")).code, "Pièce 4");
});

test("a pleading is read from the first procedural word of its name, and an appeal's filers are told apart", () => {
  const read = (path) => { const { role, party, kind } = classify(path); return { role, party, kind }; };
  // Two words in one name: the first decides, and "Klageantwort" is not a "Klage".
  assert.deepEqual(read("02 Klageantwort und Widerklage Säntis AG.pdf"), { role: "response", party: "P2", kind: null });
  assert.deepEqual(read("03 Replik und Widerklageantwort Muster AG.pdf"), { role: "submission", party: "P1", kind: "reply" });
  assert.deepEqual(read("04 Duplik und Widerklagereplik Muster AG.pdf"), { role: "submission", party: "P2", kind: "rejoinder" });
  assert.deepEqual(read("01 Recours en matière de droit public Rochat.pdf"), { role: "claim", party: "P1", kind: "appeal" });
  assert.deepEqual(read("02 Réponse Dupont et Martin.pdf"), { role: "response", party: "P2", kind: null });
  assert.deepEqual(read("03 Observations Municipalité de Belmont.pdf"), { role: "response", party: "P2", kind: "authority" });
  assert.deepEqual(read("04 Observations Tribunal cantonal.pdf"), { role: "response", party: "P2", kind: "lower_instance" });
  assert.deepEqual(read("05 Observations OFEV.pdf"), { role: "response", party: "P2", kind: "authority" });
  assert.deepEqual(read("02 Vernehmlassung Baurekursgericht.pdf"), { role: "response", party: "P2", kind: "lower_instance" });
  assert.deepEqual(read("01 Berufung Huber.pdf"), { role: "claim", party: "P1", kind: "civil_appeal" });
  // The record of the court below holds documents, whatever their names say.
  assert.deepEqual(read("Vorakten/Baugesuch.pdf"), { role: "exhibit", party: null, kind: null });
  assert.deepEqual(read("Dossier cantonal/Pièce 201 Demande de permis.pdf"), { role: "exhibit", party: null, kind: null });
});

test("an appeal's pleadings are labelled as an appeal, observations and a reply, in the language of the proceedings", () => {
  const sources = ["01 Recours Rochat.pdf", "02 Réponse Dupont.pdf", "03 Observations Municipalité de Belmont.pdf", "04 Observations OFEV.pdf", "05 Réplique Rochat.pdf"]
    .map(name => { const guess = classify(name); return { name, role: guess.role, code: guess.code, guess }; });
  assert.deepEqual(neutralLabels(structuredClone(sources), "fr").map(s => s.label), ["Recours", "Réponse", "Observations 1", "Observations 2", "Réplique"]);
  assert.deepEqual(neutralLabels(structuredClone(sources), "de").map(s => s.label), ["Beschwerde", "Beschwerdeantwort", "Vernehmlassung 1", "Vernehmlassung 2", "Replik"]);
  // A role the user changed is labelled by that role.
  const changed = structuredClone(sources);
  changed[4].role = "exhibit";
  assert.equal(neutralLabels(changed, "fr")[4].label, "Pièce");
});
