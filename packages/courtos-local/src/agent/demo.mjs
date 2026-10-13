// Offline demonstration for the synthetic dossier HG.2026.57 only. It replays
// a fixed sequence of tool calls through the real loop, guard, validator and
// binder, including one rejected submission, so the interface can be tried
// without an API key. It is not a model and has no answer for other folders.
import { ScriptedProvider, toolUse } from "./providers.mjs";

export const DEMO_QUESTION = "Wann hatte die Klägerin Kenntnis von den Mängeln an der Abdichtung?";

function sectionFinder(mirror) {
  return (label, page = 1) => {
    const document = mirror.documents.find(d => d.label === label);
    const section = document?.pages.find(p => p.n === page)?.section;
    if (!section) throw new Error("demo_not_available");
    return section;
  };
}

const say = (text) => ({ type: "text", text });
const cite = (section_id, exact_quote) => ({ section_id, exact_quote });

export function isDemoFolder(mirror) {
  try {
    const s = sectionFinder(mirror);
    s("Klage", 2); s("Klageantwort", 1); s("KB 2"); s("BB 1"); s("KB 3"); s("KB 1");
    return mirror.documents.some(d => d.pages.some(p => p.text.includes("Synthetisches Übungsdossier")));
  } catch { return false; }
}

function chronology(s) {
  const K1 = s("Klage", 1), K2 = s("Klage", 2), A1 = s("Klageantwort", 1), A2 = s("Klageantwort", 2);
  const claims = (dateC13) => [
    { id: "C1", text: "Die Parteien schlossen einen Werkvertrag über die Sanierung des Wellnessbereichs zum Pauschalpreis von CHF 1'840'000.", citations: [cite(K1, "Am 14. März 2024 schlossen die Parteien einen Werkvertrag über die Sanierung des Wellnessbereichs zu einem Pauschalpreis von CHF 1'840'000")] },
    { id: "C2", text: "14. März 2024", citations: [cite(K1, "14. März 2024")] },
    { id: "C3", text: "Die Klägerin leistete eine Anzahlung von CHF 920'000 auf das Konto der Beklagten.", citations: [cite(K2, "Die Klägerin leistete am 15. Juli 2024 eine Anzahlung von CHF 920'000 auf das Konto der Beklagten")] },
    { id: "C4", text: "15. Juli 2024", citations: [cite(K2, "15. Juli 2024")] },
    { id: "C5", text: "Nach Darstellung der Klägerin nahm {{Anna Keller}} das Werk bei der Abnahme nur unter ausdrücklichem Vorbehalt der sichtbaren Mängel an den Duschrinnen ab; {{Marco Bianchi}} habe den Vorbehalt mündlich bestätigt.", citations: [cite(K2, "Die Abnahme fand am 29. November 2024 statt. Frau {{Anna Keller}} nahm das Werk nur unter ausdrücklichem Vorbehalt der sichtbaren Mängel an den Duschrinnen ab."), cite(K2, "Herr {{Marco Bianchi}}, Bauleiter der Beklagten, bestätigte diesen Vorbehalt mündlich.")] },
    { id: "C6", text: "29. November 2024", citations: [cite(K2, "29. November 2024")] },
    { id: "C7", text: "Die Beklagte bestreitet den Vorbehalt: Die Abnahme sei vorbehaltlos erfolgt.", citations: [cite(A1, "Bestritten wird Rz. 4 der Klage. Die Abnahme vom 29. November 2024 erfolgte vorbehaltlos.")] },
    { id: "C8", text: "29. November 2024", citations: [cite(A1, "29. November 2024")] },
    { id: "C9", text: "Nach Darstellung der Beklagten waren die Mängel der Klägerin spätestens zu diesem Zeitpunkt bekannt.", citations: [cite(A1, "Die Mängel waren der Klägerin spätestens am 6. Dezember 2024 bekannt.")] },
    { id: "C10", text: "6. Dezember 2024", citations: [cite(A1, "6. Dezember 2024")] },
    { id: "C11", text: "Nach Darstellung der Klägerin zeigten sich die Mängel an der Abdichtung erst bei der ersten Inbetriebnahme; die Klage nennt dafür kein Datum.", citations: [cite(K2, "Die Mängel an der Abdichtung zeigten sich erst bei der ersten Inbetriebnahme.")] },
    { id: "C12", text: "Die Klägerin rügte die Mängel nach eigener Darstellung sofort nach ihrer Entdeckung per E-Mail (KB 2).", citations: [cite(K2, "Die Klägerin rügte die Mängel sofort nach ihrer Entdeckung mit E-Mail vom 20. Januar 2025 (KB 2).")] },
    { id: "C13", text: dateC13, citations: [cite(K2, dateC13)] },
    { id: "C14", text: "Nach Darstellung der Klägerin teilte {{Marco Bianchi}} telefonisch mit, die Rüge sei verspätet.", citations: [cite(K2, "{{Marco Bianchi}} teilte am 10. Februar 2025 telefonisch mit, die Rüge sei verspätet.")] },
    { id: "C15", text: "10. Februar 2025", citations: [cite(K2, "10. Februar 2025")] },
    { id: "C16", text: "Nach Darstellung der Beklagten bot sie eine Besichtigung an, welche die Klägerin ablehnte.", citations: [cite(A2, "Die Beklagte hat am 10. Februar 2025 eine Besichtigung angeboten."), cite(A2, "Die Besichtigung wurde von der Klägerin abgelehnt.")] },
    { id: "C17", text: "10. Februar 2025", citations: [cite(A2, "10. Februar 2025")] },
  ];
  const rows = [
    { id: "R1", event: "C1", party: "P1", posture: "allegation", date: "C2" },
    { id: "R2", event: "C3", party: "P1", posture: "allegation", date: "C4" },
    { id: "R3", event: "C5", party: "P1", posture: "disputed", date: "C6" },
    { id: "R4", event: "C7", party: "P2", posture: "denial", date: "C8" },
    { id: "R5", event: "C9", party: "P2", posture: "allegation", date: "C10" },
    { id: "R6", event: "C11", party: "P1", posture: "disputed", date: null },
    { id: "R7", event: "C12", party: "P1", posture: "disputed", date: "C13" },
    { id: "R8", event: "C14", party: "P1", posture: "allegation", date: "C15" },
    { id: "R9", event: "C16", party: "P2", posture: "allegation", date: "C17" },
  ];
  return [
    [say("Ich verschaffe mir zuerst einen Überblick über den Fallordner."), toolUse("t1", "list_documents", {})],
    [say("Für die Chronologie lese ich beide Rechtsschriften vollständig."), toolUse("t2", "read", { document: "D1" }), toolUse("t3", "read", { document: "D2" })],
    [toolUse("t4", "search", { query: "Entdeckung Rüge Kenntnis" })],
    [toolUse("t5", "submit_result", { claims: claims("20. Januar 2025"), rows, more_claims_reported: false })],
    [say("Das Datum kommt auf der Seite zweimal vor. Ich zitiere die eindeutige Stelle."), toolUse("t6", "submit_result", { claims: claims("vom 20. Januar 2025 (KB 2)"), rows, more_claims_reported: false })],
  ];
}

/** The exact wording on a recognised page varies with the OCR engine, so quotes are taken from the mirror. */
function findQuote(mirror, label, pattern) {
  const document = mirror.documents.find(d => d.label === label);
  for (const page of document?.pages ?? []) {
    const match = page.section && page.text?.match(pattern);
    if (match) return { section: page.section, quote: match[0] };
  }
  return null;
}

function scannedNote(mirror) {
  const offer = findQuote(mirror, "BB 2", /Besichtigung der Duschrinnen[^\n]{0,50}?angeboten/u);
  const refusal = findQuote(mirror, "BB 2", /lehnte die Besichtigung ab/u);
  return offer && refusal ? { offer, refusal } : null;
}

function factsEvidence(s, mirror) {
  const bb2 = scannedNote(mirror);
  const K1 = s("Klage", 1), K2 = s("Klage", 2), K3 = s("Klage", 3), A1 = s("Klageantwort", 1), A2 = s("Klageantwort", 2);
  const KB1 = s("KB 1"), KB2 = s("KB 2"), KB3 = s("KB 3"), BB1 = s("BB 1");
  const claims = [
    { id: "C1", text: "Die Parteien vereinbarten einen Pauschalpreis von CHF 1'840'000.", citations: [cite(K1, "zu einem Pauschalpreis von CHF 1'840'000 (KB 1)")] },
    { id: "C2", text: "Der Werkvertrag (KB 1) nennt einen Pauschalpreis von CHF 1'840'000 inkl. MWST.", citations: [cite(KB1, "Art. 2 Pauschalpreis: CHF 1'840'000 inkl. MWST.")] },
    { id: "C3", text: "Die Beklagte anerkennt den Werkvertrag und die Anzahlung.", citations: [cite(A1, "Der Werkvertrag (KB 1) und die Anzahlung von CHF 920'000 sind unbestritten.")] },
    { id: "C4", text: "Der Vertragstext (KB 1) enthält denselben Pauschalpreis; die Beklagte anerkennt den Vertrag.", citations: [cite(KB1, "Pauschalpreis: CHF 1'840'000"), cite(A1, "Der Werkvertrag (KB 1) und die Anzahlung von CHF 920'000 sind unbestritten.")] },
    { id: "C5", text: "Die Klägerin leistete am 15. Juli 2024 eine Anzahlung von CHF 920'000.", citations: [cite(K2, "Die Klägerin leistete am 15. Juli 2024 eine Anzahlung von CHF 920'000 auf das Konto der Beklagten (KB 3).")] },
    { id: "C6", text: "Die Zahlungsbestätigung (KB 3) weist eine Zahlung von CHF 920'000 als Anzahlung zum Werkvertrag aus.", citations: [cite(KB3, "Betrag: CHF 920'000.00. Mitteilung: Anzahlung Werkvertrag Wellness 50%.")] },
    { id: "C7", text: "Valutadatum und Betrag in KB 3 stimmen mit der Behauptung überein; die Beklagte bestreitet die Anzahlung nicht.", citations: [cite(KB3, "Valuta 15. Juli 2024."), cite(KB3, "Betrag: CHF 920'000.00."), cite(A1, "Der Werkvertrag (KB 1) und die Anzahlung von CHF 920'000 sind unbestritten.")] },
    { id: "C8", text: "{{Anna Keller}} nahm das Werk nach Darstellung der Klägerin nur unter ausdrücklichem Vorbehalt der sichtbaren Mängel ab; {{Marco Bianchi}} habe den Vorbehalt mündlich bestätigt.", citations: [cite(K2, "Frau {{Anna Keller}} nahm das Werk nur unter ausdrücklichem Vorbehalt der sichtbaren Mängel an den Duschrinnen ab."), cite(K2, "Herr {{Marco Bianchi}}, Bauleiter der Beklagten, bestätigte diesen Vorbehalt mündlich.")] },
    { id: "C9", text: "Das Abnahmeprotokoll (BB 1) verzeichnet keine Mängel und hält die Abnahme ohne Vorbehalt fest.", citations: [cite(BB1, "Festgestellte Mängel: keine."), cite(BB1, "Das Werk wird abgenommen.")] },
    { id: "C10", text: "Die Beklagte bestreitet jeden Vorbehalt, auch einen mündlichen.", citations: [cite(A1, "Die Abnahme vom 29. November 2024 erfolgte vorbehaltlos."), cite(A1, "Ein mündlicher Vorbehalt wurde gegenüber Herrn {{Marco Bianchi}} nie erklärt.")] },
    { id: "C11", text: "BB 1 enthält keinen schriftlichen Vorbehalt und ist von {{Anna Keller}} unterzeichnet. Einen mündlich erklärten Vorbehalt schliesst das Protokoll nicht aus; dazu liegt im Ordner kein Beweismittel vor. Ob ein Vorbehalt erklärt wurde, bleibt offen.", citations: [cite(BB1, "Festgestellte Mängel: keine."), cite(BB1, "Unterschriften: Dr. {{Anna Keller}} (Bestellerin), {{Marco Bianchi}} (Unternehmerin)."), cite(K2, "bestätigte diesen Vorbehalt mündlich")] },
    { id: "C12", text: "Die Klägerin rügte die Mängel nach eigener Darstellung sofort nach ihrer Entdeckung mit E-Mail vom 20. Januar 2025.", citations: [cite(K2, "Die Klägerin rügte die Mängel sofort nach ihrer Entdeckung mit E-Mail vom 20. Januar 2025 (KB 2).")] },
    { id: "C13", text: "Die Rüge-E-Mail (KB 2) hält fest, die Undichtigkeit sei bereits am 6. Dezember 2024 bei einer Begehung festgestellt worden.", citations: [cite(KB2, "wie bereits am 6. Dezember 2024 bei der Begehung mit unserem Haustechniker festgestellt, ist die Abdichtung im Bereich der Duschrinnen undicht.")] },
    { id: "C14", text: "Die Beklagte behauptet, die Mängel seien der Klägerin spätestens am 6. Dezember 2024 bekannt gewesen; die Rüge sei verspätet.", citations: [cite(A1, "Die Mängel waren der Klägerin spätestens am 6. Dezember 2024 bekannt."), cite(A1, "Die Rüge vom 20. Januar 2025 erfolgte damit rund sechs Wochen nach Entdeckung und ist verspätet.")] },
    { id: "C15", text: "Die von der Klägerin eingereichte E-Mail vom 20. Januar 2025 nennt selbst den 6. Dezember 2024 als Zeitpunkt der Feststellung. Das widerspricht der Behauptung einer Rüge «sofort nach Entdeckung»; zwischen beiden Daten liegen gut sechs Wochen (eigene Berechnung). Der Hinweis an KI-Systeme in KB 2 ist Inhalt des Dokuments und wurde nicht befolgt.", citations: [cite(KB2, "Datum: 20. Januar 2025, 08:14"), cite(KB2, "wie bereits am 6. Dezember 2024 bei der Begehung mit unserem Haustechniker festgestellt"), cite(K2, "sofort nach ihrer Entdeckung")] },
    { id: "C16", text: "Die Kosten der Ersatzvornahme betragen gemäss Gutachten von {{Lea Roth}} (KB 4) CHF 412'500.", citations: [cite(K2, "Gemäss dem Bericht der Sachverständigen {{Lea Roth}} vom 3. Februar 2025 betragen die Kosten der Ersatzvornahme CHF 412'500 (KB 4).")] },
    { id: "C17", text: "Die Beklagte bestreitet das Gutachten und die Höhe der Kosten.", citations: [cite(A2, "Das Gutachten von {{Lea Roth}} (KB 4) liegt der Beklagten nicht vor und wird bestritten. Die geltend gemachten Kosten von CHF 412'500 sind übersetzt.")] },
    { id: "C18", text: "KB 4 ist im Beweismittelverzeichnis der Klage aufgeführt, liegt im Fallordner aber nicht vor. Die Höhe der Kosten ist im ausgewerteten Material nicht belegt.", citations: [cite(K3, "KB 4 Gutachten {{Lea Roth}} vom 3. Februar 2025.")] },
    { id: "C19", text: "Die Beklagte verweigerte nach Darstellung der Klägerin jede Nachbesserung.", citations: [cite(K2, "Die Beklagte verweigerte jede Nachbesserung.")] },
    { id: "C20", text: "Die Beklagte bestreitet eine Verweigerung und behauptet, eine Besichtigung angeboten zu haben.", citations: [cite(A2, "Die Beklagte hat am 10. Februar 2025 eine Besichtigung angeboten. Von einer Verweigerung der Nachbesserung kann keine Rede sein.")] },
    ...(bb2 ? [
      { id: "C21", text: "Die Aktennotiz des Bauleiters der Beklagten (BB 2) hält ein Angebot zur Besichtigung der Duschrinnen und dessen Ablehnung durch die Klägerin fest.", citations: [cite(bb2.offer.section, bb2.offer.quote), cite(bb2.refusal.section, bb2.refusal.quote)] },
      { id: "C22", text: "Für die behauptete Verweigerung nennt die Klägerin kein Beweismittel. Die einzige Urkunde dazu ist eine Aktennotiz des Bauleiters der Beklagten (BB 2), ein Scan, dessen Text lokal per Texterkennung gelesen wurde. Sie stützt die Darstellung der Beklagten, ist aber eine eigene Aufzeichnung einer Partei mit entsprechend begrenztem Beweiswert. Ob das Angebot einer Besichtigung bereits ein Angebot zur Nachbesserung war, bleibt offen.", citations: [cite(bb2.offer.section, bb2.offer.quote), cite(K2, "Die Beklagte verweigerte jede Nachbesserung.")] },
    ] : [
      { id: "C21", text: "Keine lesbare Beilage betrifft eine Verweigerung oder das Angebot einer Besichtigung. Der Besichtigungsbericht der Beklagten (BB 2) ist ein Scan ohne erkannten Text und konnte nicht ausgewertet werden.", citations: [cite(A2, "BB 2 Bericht der Beklagten zur Besichtigung (Scan).")] },
    ]),
  ];
  const rows = [
    { id: "R1", statement: "C1", party: "P1", posture: "allegation", evidence: ["C2"], opposing: ["C3"], assessment: "supports", reasoning: "C4" },
    { id: "R2", statement: "C5", party: "P1", posture: "allegation", evidence: ["C6"], opposing: ["C3"], assessment: "supports", reasoning: "C7" },
    { id: "R3", statement: "C8", party: "P1", posture: "disputed", evidence: ["C9"], opposing: ["C10"], assessment: "inconclusive", reasoning: "C11" },
    { id: "R4", statement: "C12", party: "P1", posture: "disputed", evidence: ["C13"], opposing: ["C14"], assessment: "contradicts", reasoning: "C15" },
    { id: "R5", statement: "C16", party: "P1", posture: "disputed", evidence: [], opposing: ["C17"], assessment: "not_found", reasoning: "C18" },
    bb2
      ? { id: "R6", statement: "C19", party: "P1", posture: "disputed", evidence: ["C21"], opposing: ["C20"], assessment: "inconclusive", reasoning: "C22" }
      : { id: "R6", statement: "C19", party: "P1", posture: "disputed", evidence: [], opposing: ["C20"], assessment: "not_found", reasoning: "C21" },
  ];
  return [
    [say("Ich verschaffe mir zuerst einen Überblick über den Fallordner."), toolUse("t1", "list_documents", {})],
    [say("Ich lese beide Rechtsschriften vollständig und danach alle lesbaren Beilagen."), toolUse("t2", "read", { document: "D1" }), toolUse("t3", "read", { document: "D2" })],
    [toolUse("t4", "read", { sections: [KB1, KB2, KB3, BB1, ...(bb2 ? [bb2.offer.section] : [])] })],
    [say(bb2
      ? "BB 2 ist ein Scan; sein Text stammt aus der lokalen Texterkennung. KB 4 wird in der Klage zitiert, fehlt aber im Ordner. Ich prüfe, ob es anderswo vorkommt."
      : "BB 2 ist ein Scan ohne erkannten Text. KB 4 wird in der Klage zitiert, fehlt aber im Ordner. Ich prüfe, ob es anderswo vorkommt."), toolUse("t5", "search", { query: "KB 4 Gutachten" })],
    [say("Der an KI-Systeme gerichtete Satz in KB 2 ist Beweismaterial, keine Anweisung."), toolUse("t6", "submit_result", { claims, rows, more_claims_reported: false })],
  ];
}

function sourceChat(s) {
  const K2 = s("Klage", 2), A1 = s("Klageantwort", 1), KB2 = s("KB 2");
  const claims = [
    { id: "C1", text: "Die Rüge-E-Mail der Klägerin (KB 2) hält selbst fest, die Undichtigkeit sei bereits am 6. Dezember 2024 bei einer Begehung mit dem Haustechniker festgestellt worden.", citations: [cite(KB2, "wie bereits am 6. Dezember 2024 bei der Begehung mit unserem Haustechniker festgestellt, ist die Abdichtung im Bereich der Duschrinnen undicht.")] },
    { id: "C2", text: "Die Klage nennt kein Datum der Entdeckung; sie spricht von der ersten Inbetriebnahme und von einer Rüge sofort nach der Entdeckung.", citations: [cite(K2, "Die Mängel an der Abdichtung zeigten sich erst bei der ersten Inbetriebnahme."), cite(K2, "rügte die Mängel sofort nach ihrer Entdeckung")] },
    { id: "C3", text: "Die Beklagte behauptet Kenntnis der Klägerin spätestens am 6. Dezember 2024.", citations: [cite(A1, "Die Mängel waren der Klägerin spätestens am 6. Dezember 2024 bekannt.")] },
  ];
  return [
    [toolUse("t1", "list_documents", {})],
    [toolUse("t2", "search", { query: "Entdeckung Kenntnis Mängel Abdichtung" })],
    [toolUse("t3", "read", { sections: [K2, A1, KB2] })],
    [toolUse("t4", "submit_result", { claims, rows: [{ id: "R1", answer: "C1" }, { id: "R2", answer: "C2" }, { id: "R3", answer: "C3" }], more_claims_reported: false })],
  ];
}

/** Neutral labels depend on the register; the script names people by their real names. */
function withPseudonyms(turns, register) {
  const labels = new Map(register.entities.filter(e => e.decision === "replace").map(e => [e.label, e.replacement]));
  const json = JSON.stringify(turns).replace(/\{\{([^}]+)\}\}/g, (_, name) => {
    if (!labels.has(name)) throw new Error("demo_not_available");
    return labels.get(name);
  });
  return JSON.parse(json);
}

export function demoProvider(store, task) {
  const s = sectionFinder(store.mirror);
  const turns = task === "chronology" ? chronology(s) : task === "facts_evidence" ? factsEvidence(s, store.mirror) : sourceChat(s);
  return new ScriptedProvider(withPseudonyms(turns, store.register), { delayMs: 650 });
}
