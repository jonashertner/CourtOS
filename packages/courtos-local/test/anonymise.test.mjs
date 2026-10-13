import { test } from "node:test";
import assert from "node:assert/strict";
import { capitalisedForms, compileTextTransformation } from "@courtos/projection";
import { consolidatePersons, initialsAlone, suggestAnonymisation, surnamesAlone } from "../src/anonymise.mjs";
import { detectCandidates } from "../src/detect.mjs";
import { compileGuard } from "../src/guard.mjs";
import { compilePageTransform } from "../src/mirror.mjs";
import { CaseStore } from "../src/caseStore.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));

const doc = (text) => [{ id: "D1", pages: [{ n: 1, text, has_text: true }] }];
const detected = (text) => detectCandidates(doc(text)).map(c => [c.kind, ...c.aliases]);
const term = (entity_id, replacement, aliases, extra = {}) => ({ entity_id, revision: 1, reviewed: true, replacement, aliases, ...extra });
const entity = (id, kind, replacement, aliases, extra = {}) => ({ id, kind, revision: 1, decision: "replace", replacement, aliases, ...extra });

test("an alias that is an ordinary word is replaced only capitalised, from whichever spelling was kept", () => {
  assert.deepEqual(capitalisedForms("ledger"), ["Ledger", "LEDGER"]);
  for (const aliases of [["Ledger"], ["LEDGER"], ["ledger", "LEDGER"]]) {
    const transform = compileTextTransformation([term("E1", "A.________", aliases, { match: "capitalised" })]);
    assert.equal(transform("the General Ledger, LEDGER, a ledger").text, "the General A.________, A.________, a ledger");
  }
});

test("a match inside a longer one is covered by it; crossing matches of two identities fail closed, of one are joined", () => {
  const nested = compileTextTransformation([term("E1", "A.________", ["Moser Herrmann"]), term("E2", "B.________", ["Herrmann"])]);
  assert.equal(nested("Moser Herrmann und Herrmann").text, "A.________ und B.________");
  const same = compileTextTransformation([term("E1", "A.________", ["M. F.", "F. Mercier"])]);
  assert.equal(same("par M. F. Mercier, associé").text, "par A.________, associé");
  const crossing = compileTextTransformation([term("E1", "A.________", ["Anna Keller"]), term("E2", "B.________", ["Keller Bau"])]);
  assert.throws(() => crossing("Anna Keller Bau"), { code: "ambiguous_occurrence" });
});

test("every registered kind is replaced, and a later pass does not look inside an earlier label", () => {
  const register = { entities: [
    entity("E1", "plate", "Plaque 1", ["BE 123456"]),
    entity("E2", "birthdate", "Date de naissance 1", ["14.08.1979"]),
    entity("E3", "person", "A.________", ["Date"], { match: "capitalised" }),
  ] };
  const result = compilePageTransform(register)("Véhicule BE 123456, né le 14.08.1979. Date: hier.");
  assert.equal(result.text, "Véhicule Plaque 1, né le Date de naissance 1. A.________: hier.");
  assert.deepEqual(result.residual, []);
});

test("number plates, dates of birth, initials, foreign VAT numbers, Italian and English firms and banks are detected", () => {
  assert.deepEqual(detected("Fahrzeug SG 412 873 des Beklagten"), [["plate", "SG 412 873"]]);
  assert.deepEqual(detected("geboren am 3. März 1981 in Chur").filter(([k]) => k === "birthdate"), [["birthdate", "3. März 1981"]]);
  assert.deepEqual(detected("né le 14.08.1979").filter(([k]) => k === "birthdate"), [["birthdate", "14.08.1979"]]);
  assert.ok(detected("Mail von D.L. an die HR").some(([k, a]) => k === "person" && a === "D.L."));
  assert.ok(!detected("Gemäss U.S. law and N.B. the clause").some(([k]) => k === "person"));
  assert.ok(detected("VAT GB 123 4567 89").some(([k]) => k === "uid"));
  assert.ok(detected("Officine Meccaniche Varesine S.r.l. a Varese").some(([k, a]) => k === "organisation" && a.includes("Varesine")));
  assert.deepEqual(detected("Raiffeisenbank Rheintal Bahnhofstrasse 9"), [["organisation", "Raiffeisenbank Rheintal"], ["address", "Bahnhofstrasse 9"]]);
  assert.ok(!detected("Aareland Bank AG").some(([k, a]) => a === "Bank AG"), "Bank AG is the company rule's");
});

test("a postcode and town stay on one line, and a year before an article is no place", () => {
  assert.ok(!detected("vom 4. Mai 2024\nLe contrat").some(([k]) => k === "place"));
  const { candidates } = suggestAnonymisation(doc("Hotel in 6354 Vitznau. Gäste in Vitznau. En 2024 Les parties signent."));
  const places = candidates.filter(c => c.kind === "place").map(c => c.aliases);
  assert.ok(places.some(a => a.includes("Vitznau")), "a town that is also in the vocabulary is still replaced on its own");
  assert.ok(!places.some(a => a.some(x => /les/i.test(x))));
});

test("a year before a currency is no place", () => {
  const found = detected("Umsatz\n2024 CHF 180'000\n2025 CHF 210'000\n2026 EUR 12'000\nSitz in 8005 Zürich");
  assert.ok(!found.some(([k, ...a]) => k === "place" && a.some(x => /CHF|EUR/.test(x))));
  assert.ok(found.some(([k, ...a]) => k === "place" && a.some(x => x.includes("Zürich"))));
});

test("in the samples, headings, document labels and words written in lower case stay readable", async () => {
  const mirrorOf = async (folder) => {
    const work = await mkdtemp(join(tmpdir(), "courtos-readable-"));
    const store = await CaseStore.open(join(FIXTURES, folder), { work });
    try {
      await store.scan();
      return { register: store.register, text: store.mirror.documents.flatMap(d => d.pages.map(p => p.text)).join("\n") };
    } finally { store.close(); await rm(work, { recursive: true, force: true }); }
  };
  const fr = await mirrorOf("PC.2026.0914 Domaine des Tourelles SA");
  assert.match(fr.text, /\nC\. Sur l’objection anticipée/u, "a heading is no initial and surname");
  assert.match(fr.text, / sur /u);
  assert.ok(!fr.register.entities.some(e => e.decision === "replace" && e.aliases.includes("Pièce")), "a document label is no name");
  assert.doesNotMatch(fr.text, /Chatelain/u, "counsel's surname in the firm's name");
  const en = await mirrorOf("HG ICC 2026 7 Zytglogge Praezisionsinstrumente AG");
  assert.equal(en.register.entities.find(e => e.aliases.includes("May"))?.match, "capitalised");
  assert.match(en.text, / may /u);
  // "C. Georges et Marianne Bettex" opens a lettered paragraph: "C." is no initial of a second person,
  // so Georges Bettex keeps one entry (it had three) and his name is replaced everywhere.
  const permis = await mirrorOf("1C_412_2026 Bettex");
  const georges = permis.register.entities.filter(e => e.decision === "replace" && e.aliases.some(a => /(?<!\p{L})Georges(?!\p{L})/u.test(a)));
  assert.deepEqual(georges.map(e => e.aliases.includes("Georges Bettex") && e.aliases.includes("Georges")), [true]);
  assert.doesNotMatch(permis.text, /Georges|Bettex/u);
  assert.match(permis.text, /\nC\. \p{Lu}+\.________ et /u);
});

test("one person's entries join; a surname standing alone joins its person or, if shared, stands on its own", () => {
  const person = (aliases, extra = {}) => ({ kind: "person", label: aliases[0], aliases, count: 1, samples: [], notes: [], decision: "replace", ...extra });
  const joined = consolidatePersons([person(["Fabien Mercier"]), person(["M. Fabien Mercier"]), person(["Fabien"]), person(["Pour"], { match: "capitalised" })]);
  assert.deepEqual(joined.map(c => c.aliases), [["M. Fabien Mercier", "Fabien Mercier", "Fabien"], ["Pour"]]);
  const pages = [{ doc: "D1", page: 1, text: "Me Delphine Chatelain, Chatelain & Associés. Thierry Baudin et Anne Baudin; Baudin conteste." }];
  const candidates = surnamesAlone([person(["Delphine Chatelain"]), person(["Thierry Baudin"]), person(["Anne Baudin"])], pages);
  assert.ok(candidates[0].aliases.includes("Chatelain"));
  assert.ok(candidates.some(c => c.notes.includes("shared_surname") && c.aliases[0] === "Baudin"));
});

test("initials in capitals join their person; initials that are a word or an abbreviation are shown and kept", () => {
  const person = (aliases) => ({ kind: "person", label: aliases[0], aliases, count: 1, samples: [], notes: [], decision: "replace" });
  const pages = [{ doc: "D1", page: 1, text: "Notiz FC. TB sagt, ab Januar gelte Art. 97 OR. JPR war dabei. Nadja Frei protokolliert; NF schreibt nur Zahlen. TS und TS." }];
  const candidates = initialsAlone([person(["Herr Thomas Burkhard"]), person(["Flurin Caduff"]), person(["Otto Rossi"]), person(["Anna Brunner"]), person(["Jean-Pierre Rochat"]),
    person(["Nadja"]), person(["Frei"]), person(["Tanja Sutter"]), person(["Tobias Senn"])], pages);
  const has = (alias) => candidates.find(c => c.aliases.includes(alias));
  assert.equal(has("TB").label, "Herr Thomas Burkhard", "a title is no initial");
  assert.equal(has("FC").label, "Flurin Caduff");
  assert.equal(has("JPR").label, "Jean-Pierre Rochat", "each part of a double first name counts");
  assert.deepEqual([has("NF").decision, has("NF").notes], ["replace", ["initials"]], "a first name and a surname held as two entries");
  assert.deepEqual([has("TS").decision, has("TS").notes], ["replace", ["shared_initials"]]);
  assert.deepEqual([has("OR").decision, has("OR").notes, has("OR").match], ["keep", ["initials_word"], "capitalised"], "Art. 97 OR stays");
  assert.equal(has("AB"), undefined, "\"ab\" in lower case is a word, not initials");
});

test("the guard lets a replacement label pass, and an ordinary word only where the model wrote it", () => {
  const register = { entities: [entity("E1", "person", "A.________", ["Lieu"], { match: "capitalised" }), entity("E2", "person", "B.________", ["Anna Keller"]), entity("E3", "place", "Lieu 6", ["Vitznau"])] };
  const guard = compileGuard({ register, realRoot: "/nowhere" });
  assert.deepEqual(guard.scan("à Lieu 6, selon A.________"), []);
  assert.deepEqual(guard.scan("Lieu: Lausanne"), [{ kind: "registered", entity: "E1" }], "a word the files wrote counts");
  assert.ok(guard.checkBody({ messages: [{ role: "assistant", content: [{ type: "text", text: "Lieu et date: Lausanne." }] }] }));
  assert.throws(() => guard.checkBody({ messages: [{ role: "assistant", content: "Anna Keller a signé." }] }), { code: "outbound_blocked" });
  assert.throws(() => guard.checkBody({ messages: [{ role: "user", content: "Lieu: Lausanne" }] }), { code: "outbound_blocked" });
});

test("a name in a flattened e-mail header is shown without the header word, and the header form is still replaced", () => {
  const { candidates } = suggestAnonymisation(doc("Von Thomas Baumann <t.baumann@example.ch> An Urs Vogel <u.vogel@example.ch> Cc Anna Meier"));
  const vogel = candidates.find(c => c.kind === "person" && c.aliases.includes("Urs Vogel"));
  assert.equal(vogel.label, "Urs Vogel");
  assert.ok(vogel.aliases.includes("An Urs Vogel"), "the form with the header word stays an alias");
  assert.ok(candidates.every(c => !/^(An|Cc) /u.test(c.label)));
});

test("a firm named after a person is replaced whole when what is left is a long ordinary word", () => {
  const replaced = (firm) => suggestAnonymisation(doc(`Klägerin ist die ${firm}. Geschäftsführer ist Thomas Brändli. Herr Brändli verkauft Kaffeemaschinen. Die Firma ${firm} liefert.`))
    .candidates.filter(c => c.decision === "replace" && c.kind === "organisation").flatMap(c => c.aliases);
  assert.deepEqual(replaced("Brändli Kaffeemaschinen AG"), ["Brändli Kaffeemaschinen"]);
  // A short ordinary word can be a surname: "Richter" is still replaced on its own.
  assert.deepEqual(replaced("Brändli Richter AG"), ["Richter"]);
});

test("a word opening a numbered paragraph and the formal address stay readable; a surname there is replaced", () => {
  const decisions = (text) => Object.fromEntries(suggestAnonymisation(doc(text)).candidates.map(c => [c.aliases[0], c.decision]));
  const found = decisions("Rz. 18 Eine langjährige Kundin bestätigte dies.\nRz. 20a Eine Mahnung blieb aus.\nWir stellten fest, dass Ihre Gesellschaft liefert.\nRz. 21 Weber hat bezahlt.");
  assert.equal(found.Eine, "keep");
  assert.equal(found.Ihre, "keep");
  assert.equal(found.Weber, "replace");
});

test("a parcel number before a label, a lettered heading and a French city name are no names", () => {
  const found = detected("Parcelle n° 1847 Objet Démolition d'une villa\nM. Dans leurs dernières écritures, les recourants persistent.\nM. Bettex habite 1147 Fontanivent.\nOffice fédéral, 3003 Berne. Berne a répondu.");
  assert.ok(!found.some(([, ...a]) => a.some(x => /Objet|Dans/.test(x))), JSON.stringify(found));
  assert.ok(found.some(([k, ...a]) => k === "person" && a.includes("Bettex")));
  assert.ok(found.some(([k, ...a]) => k === "place" && a.some(x => x.includes("Fontanivent"))));
  const { candidates } = suggestAnonymisation(doc("Office fédéral, 3003 Berne. Berne a répondu. Commune de 1147 Fontanivent. Fontanivent a répondu."));
  const places = candidates.filter(c => c.kind === "place").flatMap(c => c.aliases);
  assert.ok(!places.includes("Berne") && places.includes("Fontanivent"), JSON.stringify(places));
});

test("a flattened line of signatures is several people, not one", () => {
  const person = (aliases) => ({ kind: "person", label: aliases[0], aliases, count: 1, samples: [], notes: [], decision: "replace" });
  const joined = consolidatePersons([person(["Georges Bettex"]), person(["Marianne Bettex"]), person(["Werner Stucki"]),
    person(["Georges Bettex Marianne Bettex Werner Stucki", "M. Stucki"])]);
  assert.deepEqual(joined.map(c => c.aliases), [["Georges Bettex"], ["Marianne Bettex"], ["Werner Stucki", "M. Stucki"]]);
  const alone = consolidatePersons([person(["Georges Bettex"]), person(["Werner Stucki"]), person(["Georges Bettex Werner Stucki", "M. Dupont"])]);
  assert.deepEqual(alone.map(c => c.label), ["Georges Bettex", "Werner Stucki", "M. Dupont"]);
  // A word that belongs to no other entry keeps the line as one name.
  const kept = consolidatePersons([person(["Georges Bettex"]), person(["Werner Stucki"]), person(["Georges Bettex Werner Stucki Zbinden"])]);
  assert.ok(kept.some(c => c.aliases.includes("Georges Bettex Werner Stucki Zbinden")));
});

test("a court case number is replaced wherever the files introduce one, a cited precedent stays readable", () => {
  const dockets = (text) => detected(text).filter(([kind]) => kind === "docket").map(([, ...aliases]) => aliases[0]);
  for (const [text, number] of [
    ["Cause CPC n° PC.2026.0914", "PC.2026.0914"], ["Verfahren Nr. HG.2026.112", "HG.2026.112"], ["dans la cause 1C_412/2026, Bettex", "1C_412/2026"],
    ["**Case No. HG ICC 26 7**", "HG ICC 26 7"], ["Geschäfts-Nr. 2024/123", "2024/123"], ["Dossier n° 45678", "45678"],
    // The cantonal forms with a year are case numbers on their own.
    ["Causa Lanfranchi c. Technoval Swiss AG - PD.2026.184", "PD.2026.184"], ["son arrêt AC.2025.0398 du 2 avril", "AC.2025.0398"], ["Klage HG260074-O", "HG260074-O"],
  ]) assert.deepEqual(dockets(text), [number], text);
  for (const text of ["(BGE 81 II 56 E. 3; 4A_399/2018 E. 3.2)", "à cause de la TVA", "im Verfahren 2025 wurde", "Procédure du 12.03.2025", "AS 2020 1234", "ISO 230-2", "Dossier 2.1"]) {
    assert.deepEqual(dockets(text), [], text);
  }
});

test("a postcode is followed by a town of two letters at least, so a consideration is no place", () => {
  const places = (text) => detected(text).filter(([kind]) => kind === "place").map(([, ...aliases]) => aliases[0]);
  assert.deepEqual(places("(BGE 81 II 56 E. 3; 4A_399/2018 E. 3.2)"), []);
  assert.deepEqual(places("9000 St. Gallen"), ["9000 St. Gallen"]);
  assert.deepEqual(places("6592 S. Antonino"), ["6592 S. Antonino"]);
  assert.deepEqual(places("1180 Rolle."), ["1180 Rolle"]);
});
