// The language of the proceedings. Everything CourtOS itself writes into the
// anonymised version follows it: neutral document labels ("Klage", "Demande"),
// page references ("S. 2", "p. 2") and replacement labels ("Adresse 1",
// "Indirizzo 1"). Exhibit codes taken from file names ("KB 2", "pièce 4") are
// the parties' own numbering and stay as written, because the pleadings cite
// them that way.
//
// The interface language is separate: a clerk may read the interface in
// German while the case is conducted in French.

export const CASE_LANGUAGES = ["de", "fr", "it", "en"];

export const ROLE_LABEL = {
  de: { claim: "Klage", response: "Klageantwort", submission: "Eingabe", exhibit: "Beilage", literature: "Literatur", authority: "Entscheid", other: "Notiz", document: "Dokument" },
  fr: { claim: "Demande", response: "Réponse", submission: "Écriture", exhibit: "Pièce", literature: "Doctrine", authority: "Décision", other: "Note", document: "Document" },
  it: { claim: "Petizione", response: "Risposta", submission: "Allegato", exhibit: "Documento", literature: "Dottrina", authority: "Decisione", other: "Nota", document: "Documento" },
  en: { claim: "Statement of claim", response: "Statement of defence", submission: "Submission", exhibit: "Exhibit", literature: "Literature", authority: "Decision", other: "Note", document: "Document" },
};

/** Replacement labels for identifiers, by kind. Persons and organisations get letters ("A.________"). */
export const REPLACEMENT_PREFIX = {
  de: {
    person: "Person", organisation: "Organisation", address: "Adresse", parcel: "Grundstück", place: "Ort",
    email: "E-Mail", iban: "Konto", phone: "Telefon", ahv: "AHV", uid: "UID", url: "Link",
    plate: "Kennzeichen", birthdate: "Geburtsdatum", insured: "Versichertennummer", zemis: "ZEMIS-Nr.", document: "Ausweisnummer",
    account: "Kontonummer", number: "Nummer", identifier: "Kennung",
  },
  fr: {
    person: "Personne", organisation: "Organisation", address: "Adresse", parcel: "Parcelle", place: "Lieu",
    email: "Courriel", iban: "Compte", phone: "Téléphone", ahv: "AVS", uid: "IDE", url: "Lien",
    plate: "Plaque", birthdate: "Date de naissance", insured: "N° d’assuré", zemis: "N° SYMIC", document: "N° de pièce d’identité",
    account: "N° de compte", number: "Numéro", identifier: "Identifiant",
  },
  it: {
    person: "Persona", organisation: "Organizzazione", address: "Indirizzo", parcel: "Fondo", place: "Luogo",
    email: "E-mail", iban: "Conto", phone: "Telefono", ahv: "AVS", uid: "IDI", url: "Link",
    plate: "Targa", birthdate: "Data di nascita", insured: "N. assicurato", zemis: "N. SIMIC", document: "N. documento d’identità",
    account: "N. conto", number: "Numero", identifier: "Identificativo",
  },
  en: {
    person: "Person", organisation: "Organisation", address: "Address", parcel: "Parcel", place: "Place",
    email: "Email", iban: "Account", phone: "Phone", ahv: "AHV", uid: "UID", url: "Link",
    plate: "Plate", birthdate: "Date of birth", insured: "Insured no.", zemis: "ZEMIS no.", document: "ID document no.",
    account: "Account no.", number: "Number", identifier: "Identifier",
  },
};

const PAGE_WORD = { de: "S.", fr: "p.", it: "pag.", en: "p." };
const PARAGRAPH_WORD = { de: "Abs.", fr: "par.", it: "cpv.", en: "para." };
const NOTE_WORD = { de: "Notiz", fr: "Note", it: "Nota", en: "Note" };

export const caseLanguage = (lang) => (CASE_LANGUAGES.includes(lang) ? lang : "de");

/** Extraction labels pages "S. 3" and paragraph ranges "Abs. 4–9"; this renders them in the case language. */
export function pageLabel(label, lang) {
  const l = caseLanguage(lang);
  return String(label ?? "").replace(/^S\. /, `${PAGE_WORD[l]} `).replace(/^Abs\. /, `${PARAGRAPH_WORD[l]} `);
}

export const noteLabel = (id, lang) => `${NOTE_WORD[caseLanguage(lang)]} ${id}`;

// Short, frequent function words. Proper names and legal terms are left out on
// purpose: a German pleading quoting a French contract stays German.
const STOPWORDS = {
  de: "der die das und ist nicht mit von zu den des dem für auf ein eine sich auch als wird wurde sind dass oder bei nach aus wie hat haben vom zur zum",
  fr: "le la les et est pas avec de des du pour sur un une que qui dans par au aux il elle ont été sont ce cette ou être son sa ses",
  it: "il lo la gli le e è non con di del della dei per su un una che nel nella sono stato stata ha hanno questo questa o essere suo sua",
  en: "the and is not with of to for that which by at it they have been are this or be his her its were from",
};
const WORDS = Object.fromEntries(Object.entries(STOPWORDS).map(([l, s]) => [l, new Set(s.split(" "))]));

/** The most likely language of the given texts, or null if there is too little text to tell. */
export function detectLanguage(texts) {
  const score = { de: 0, fr: 0, it: 0, en: 0 };
  let total = 0;
  for (const text of texts) {
    for (const word of String(text).toLocaleLowerCase().match(/\p{L}+/gu) ?? []) {
      for (const l of CASE_LANGUAGES) if (WORDS[l].has(word)) { score[l]++; total++; }
    }
  }
  if (total < 12) return null;
  return CASE_LANGUAGES.reduce((best, l) => (score[l] > score[best] ? l : best), "de");
}
