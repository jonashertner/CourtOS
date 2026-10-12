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
