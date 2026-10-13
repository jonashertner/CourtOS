// Procedural roles of the parties, in the four languages of the proceedings.
// Each role is one side of a pair that depends on the kind of proceedings
// (Klage, Gesuch, Berufung, Beschwerde), so the claimant's opponent is the
// "Beklagte" and the applicant's the "Gesuchsgegnerin". Terms are given as
// [feminine, masculine]; companies take the feminine form (die AG, la société,
// la società). Shared by the server (what Claude reads) and the interface.

export const PARTY_ROLES = [
  "claimant", "respondent",
  "applicant", "applicant_respondent",
  "appellant", "appeal_respondent",
  "objector", "objection_respondent",
  "intervenor", "lower_instance", "authority", "other",
];

/** The usual opponent of each role, used to suggest the other side of a pair. */
export const COUNTERPART = {
  claimant: "respondent", respondent: "claimant",
  applicant: "applicant_respondent", applicant_respondent: "applicant",
  appellant: "appeal_respondent", appeal_respondent: "appellant",
  objector: "objection_respondent", objection_respondent: "objector",
};

const TERMS = {
  de: {
    claimant: ["Klägerin", "Kläger"], respondent: ["Beklagte", "Beklagter"],
    applicant: ["Gesuchstellerin", "Gesuchsteller"], applicant_respondent: ["Gesuchsgegnerin", "Gesuchsgegner"],
    appellant: ["Berufungsklägerin", "Berufungskläger"], appeal_respondent: ["Berufungsbeklagte", "Berufungsbeklagter"],
    objector: ["Beschwerdeführerin", "Beschwerdeführer"], objection_respondent: ["Beschwerdegegnerin", "Beschwerdegegner"],
    intervenor: ["Nebenintervenientin", "Nebenintervenient"], lower_instance: ["Vorinstanz", "Vorinstanz"],
    authority: ["Behörde", "Behörde"], other: ["weitere Partei", "weitere Partei"],
  },
  fr: {
    claimant: ["demanderesse", "demandeur"], respondent: ["défenderesse", "défendeur"],
    applicant: ["requérante", "requérant"], applicant_respondent: ["intimée", "intimé"],
    appellant: ["appelante", "appelant"], appeal_respondent: ["intimée", "intimé"],
    objector: ["recourante", "recourant"], objection_respondent: ["intimée", "intimé"],
    intervenor: ["intervenante accessoire", "intervenant accessoire"], lower_instance: ["autorité précédente", "autorité précédente"],
    authority: ["autorité", "autorité"], other: ["autre partie", "autre partie"],
  },
  it: {
    claimant: ["attrice", "attore"], respondent: ["convenuta", "convenuto"],
    applicant: ["istante", "istante"], applicant_respondent: ["convenuta", "convenuto"],
    appellant: ["appellante", "appellante"], appeal_respondent: ["appellata", "appellato"],
    objector: ["ricorrente", "ricorrente"], objection_respondent: ["opponente", "opponente"],
    intervenor: ["interveniente adesiva", "interveniente adesivo"], lower_instance: ["autorità inferiore", "autorità inferiore"],
    authority: ["autorità", "autorità"], other: ["altra parte", "altra parte"],
  },
  en: {
    claimant: ["claimant", "claimant"], respondent: ["respondent", "respondent"],
    applicant: ["applicant", "applicant"], applicant_respondent: ["respondent to the application", "respondent to the application"],
    appellant: ["appellant", "appellant"], appeal_respondent: ["respondent to the appeal", "respondent to the appeal"],
    objector: ["complainant", "complainant"], objection_respondent: ["respondent to the complaint", "respondent to the complaint"],
    intervenor: ["intervener", "intervener"], lower_instance: ["lower instance", "lower instance"],
    authority: ["authority", "authority"], other: ["other party", "other party"],
  },
};

/**
 * The term for a role in one language. With an unknown gender both forms are
 * shown ("Klägerin/Kläger") rather than a guess.
 * @param {string} lang de | fr | it | en
 * @param {string} role one of PARTY_ROLES
 * @param {"f"|"m"|null} gender
 */
export function partyTerm(lang, role, gender = null) {
  const table = TERMS[lang] ?? TERMS.de;
  const pair = table[role] ?? table.other;
  if (gender === "f") return pair[0];
  if (gender === "m") return pair[1];
  return pair[0] === pair[1] ? pair[0] : `${pair[0]}/${pair[1]}`;
}

/** Capitalised for use as a label ("Demanderesse", "Attrice"). */
export const partyTermLabel = (lang, role, gender = null) => {
  const term = partyTerm(lang, role, gender);
  return term.charAt(0).toLocaleUpperCase(lang) + term.slice(1);
};
