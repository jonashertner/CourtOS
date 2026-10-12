import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentRun } from "../src/agent/runner.mjs";
import { ScriptedProvider } from "../src/agent/providers.mjs";
import { partyTerm } from "../web/party-roles.js";
import { freshCase, ORIGINAL_IDENTIFIERS } from "./helpers.mjs";

const entity = (store, label) => store.register.entities.find(e => e.label === label).id;

test("party roles follow the kind of proceedings, the language and the party's gender", () => {
  assert.equal(partyTerm("de", "claimant", "f"), "Klägerin");
  assert.equal(partyTerm("de", "respondent", "f"), "Beklagte");
  assert.equal(partyTerm("de", "applicant", "m"), "Gesuchsteller");
  assert.equal(partyTerm("de", "applicant_respondent", "f"), "Gesuchsgegnerin");
  assert.equal(partyTerm("de", "objector", "f"), "Beschwerdeführerin");
  assert.equal(partyTerm("fr", "applicant", "f"), "requérante");
  assert.equal(partyTerm("it", "appeal_respondent", "m"), "appellato");
  // An unknown gender shows both forms rather than a guess.
  assert.equal(partyTerm("de", "claimant", null), "Klägerin/Kläger");
});

test("Claude reads each party's role term and pseudonymised name; a change revokes the release", async () => {
  const { store, cleanup } = await freshCase();
  try {
    await store.setParties([
      { role: "applicant", entity: entity(store, "Alpenblick Hotel AG") },
      { role: "applicant_respondent", entity: entity(store, "Marco Bianchi") },
    ]);
    const [p1, p2] = store.partiesView();
    assert.equal(p1.term, "Gesuchstellerin", "a company takes the feminine form");
    assert.equal(p1.name, "Alpenblick Hotel AG", "the real name is available for local display");
    assert.equal(p2.term, "Gesuchsgegner", "\"Herr Bianchi\" in the file gives the masculine form");

    await store.release({ model: "demo", budgetChf: null });
    const run = new AgentRun({ store, provider: new ScriptedProvider([]), task: "chronology", model: "demo" });
    run.mirror = structuredClone(store.mirror);
    const listed = JSON.parse(run.toolListDocuments());
    assert.equal(listed.parties.P1.role, "Gesuchstellerin (applicant)");
    assert.match(listed.parties.P1.name_in_text, /^[A-Z]\.________ Hotel AG$/);
    const sent = JSON.stringify(listed);
    for (const identifier of ORIGINAL_IDENTIFIERS) assert.equal(sent.includes(identifier), false, `list_documents leaks ${identifier}`);

    // A name the file writes with a legal form is a company, though citecheck lists it as a person.
    await store.setParties([
      { role: "claimant", entity: entity(store, "Alpenblick Hotel AG") },
      { role: "respondent", entity: entity(store, "Bergfeld") },
    ]);
    assert.equal(store.partiesView()[1].term, "Beklagte");
    assert.equal(store.partiesView()[1].name, "Bergfeld Bau GmbH");
    assert.match(store.partiesView()[1].pseudonym, /^[A-Z]\.________ Bau GmbH$/);

    // The parties are part of what is released: changing a role or gender revokes it.
    await store.release({ model: "demo", budgetChf: null });
    assert.equal(store.consentValid(), true);
    await store.setParties([
      { role: "claimant", entity: entity(store, "Alpenblick Hotel AG") },
      { role: "respondent", entity: entity(store, "Bergfeld"), gender: "m" },
    ]);
    assert.equal(store.consentValid(), false, "a changed gender revokes the release");
    await store.setParties([
      { role: "applicant", entity: entity(store, "Alpenblick Hotel AG") },
      { role: "applicant_respondent", entity: entity(store, "Marco Bianchi"), gender: "f" },
    ]);
    assert.equal(store.consentValid(), false);
    assert.equal(store.partiesView()[1].term, "Gesuchsgegnerin", "the user's choice overrides the title in the file");

    await store.setLanguage("fr");
    assert.equal(store.partiesView()[0].term, "requérante");
    await assert.rejects(store.setParties([{ role: "claimant", entity: null, gender: "x" }]), { code: "invalid_party" });
  } finally { await cleanup(); }
});

test("an appeal's parties follow its file names until the user sets them, and parties a user set are kept", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { CaseStore } = await import("../src/caseStore.mjs");
  const dir = await mkdtemp(join(tmpdir(), "courtos-appeal-"));
  const root = join(dir, "1C_412_2026");
  await mkdir(join(root, "Dossier cantonal"), { recursive: true });
  const text = (title) => `${title}\n\nLe présent mémoire est déposé dans le délai et contient les motifs du recours ainsi que les conclusions.\n`;
  for (const name of ["01 Recours en matière de droit public.md", "02 Réponse des intimés.md", "03 Observations Municipalité.md",
    "04 Observations Tribunal cantonal.md", "05 Observations OFEV.md", "06 Réplique.md", "Dossier cantonal/Pièce 201 Demande de permis.md"]) {
    await writeFile(join(root, name), text(name));
  }
  const store = await CaseStore.open(root);
  try {
    await store.scan();
    assert.deepEqual(store.case.parties.map(p => p.role), ["objector", "objection_respondent", "authority", "lower_instance", "authority"]);
    const partyOf = (name) => store.sources.find(s => s.name === name).party;
    assert.equal(partyOf("01 Recours en matière de droit public.md"), "P1");
    assert.equal(partyOf("02 Réponse des intimés.md"), "P2");
    assert.equal(partyOf("03 Observations Municipalité.md"), "P3");
    assert.equal(partyOf("04 Observations Tribunal cantonal.md"), "P4");
    assert.equal(partyOf("05 Observations OFEV.md"), "P5", "each authority that filed is its own party");
    assert.equal(partyOf("06 Réplique.md"), "P1");
    assert.equal(partyOf("Pièce 201 Demande de permis.md"), null, "the cantonal record is no party's pleading");

    // Without the appeal the folder reads as a two-party case, and no document points to a party that is gone.
    const observations = store.sources.find(s => s.name === "05 Observations OFEV.md");
    await store.changeSource(observations.id, { party: "P5" });
    await rm(join(root, "01 Recours en matière de droit public.md"));
    await store.scan();
    assert.deepEqual(store.case.parties.map(p => p.role), ["claimant", "respondent"]);
    assert.equal(partyOf("03 Observations Municipalité.md"), "P2");
    assert.equal(partyOf("05 Observations OFEV.md"), null);
    await writeFile(join(root, "01 Recours en matière de droit public.md"), text("01 Recours en matière de droit public.md"));
    await store.scan();
    assert.equal(store.case.parties.length, 5);

    // Once the user sets the parties, a new scan keeps them.
    await store.setParties([{ role: "objector" }, { role: "objection_respondent" }]);
    await store.scan();
    assert.deepEqual(store.case.parties.map(p => p.role), ["objector", "objection_respondent"]);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a civil claim keeps claimant and respondent, and parties set before CourtOS recorded who set them are kept", async () => {
  const { store, cleanup } = await freshCase();
  try {
    assert.deepEqual(store.case.parties.map(p => p.role), ["claimant", "respondent"]);
    store.case.parties = [{ id: "P1", role: "applicant", entity: null, gender: null }, { id: "P2", role: "applicant_respondent", entity: null, gender: null }];
    delete store.case.parties_by;
    await store.scan();
    assert.deepEqual(store.case.parties.map(p => p.role), ["applicant", "applicant_respondent"]);
  } finally {
    await cleanup();
  }
});
