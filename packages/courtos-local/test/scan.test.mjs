import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/scan.mjs";

test("exhibit codes are read from file names as the parties number them, in every language", () => {
  const code = (path) => classify(path);
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
