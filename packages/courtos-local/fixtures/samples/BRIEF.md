# Sample dossiers: brief for authors

CourtOS is a tool for Swiss courts: it reads a case folder (pleadings and
exhibits), pseudonymises it, lets a language model analyse it, and binds every
statement back to the original pages. Testers at Swiss courts will open these
sample dossiers first. They must look and read like a real file at that court,
and they must exercise what the tool has to get right.

Each dossier is one JSON file in `fixtures/samples/`, rendered to PDFs, a DOCX
and a Markdown note by `fixtures/build_samples.py` (read its docstring for the
block types; `fixtures/samples/` will hold the four specs). Do not edit any other
file in the repository.

## The four dossiers

| id | language | court | matter |
|---|---|---|---|
| `sg-maschine` | de | Handelsgericht des Kantons St. Gallen | Sale and installation of a 5-axis CNC milling machine that does not hold tolerance. Buyer claims rescission or price reduction (Art. 197 ff., 205 OR) and consequential loss from downtime; seller pleads operator error, a late notice of defects (Art. 201 OR) and claims the unpaid final instalment. The machine's manufacturer is in northern Italy: its service report is in Italian. |
| `vd-fiduciaire` | fr | Chambre patrimoniale cantonale (Vaud), Lausanne | A wine-estate company sues its fiduciary (mandat, art. 394 ss, 398 CO) for missed VAT filings and a wrong salary-declaration that led to back taxes, interest and penalties; the fiduciary denies fault, pleads the client's late delivery of documents and claims unpaid fees. A letter from a Swiss-German bank or authority in German is among the exhibits. |
| `ti-lavoro` | it | Pretura del Distretto di Lugano | A dismissed sales manager claims an indemnity for abusive dismissal (art. 336, 336a CO), unpaid overtime (art. 321c CO) and a pro-rata bonus, and argues the notice was given during sick leave (art. 336c CO). The employer pleads poor performance, says overtime was neither ordered nor reported, and disputes the sick leave dates. The Zurich head office writes in German. Health data (a medical certificate) is part of the file. |
| `be-software` | en | Bern International Commercial Court, a chamber of the Commercial Court of the Canton of Bern (English-language proceedings under Art. 129 para. 2 ZPO, forum clause, foreign party) | A Bernese precision-instruments maker sues a UK-based software integrator over a failed ERP implementation: termination for cause, restitution of milestone payments and damages; the integrator blames the customer's change requests and late data, and counterclaims unpaid milestone invoices. Swiss law governs. One internal e-mail of the claimant is in German. |

Choose fictional party names, people, firms and a plausible fictional case number.
The court's real name is fine; its judges and clerks are fictional.

## Size and documents

"Substantial" means a real file, not a sketch:

- **Claim** (pleading): 8 to 12 rendered pages. Parties and counsel, prayers for
  relief, formal points (jurisdiction, value in dispute, why there was no
  conciliation if so), facts in numbered paragraphs each citing its exhibits,
  legal argument citing statutes, evidence list, signature.
- **Response** (pleading): 7 to 10 pages. Answers the claim paragraph by
  paragraph (admitted / denied / not known), its own facts, legal argument,
  counterclaim where the matter has one, evidence list.
- **Exhibits**: 16 to 22 files across both parties, each posing as what it is,
  with letterheads where a company wrote it:
  agreement or contract (3 to 5 pages, `"font": "serif"`), general terms
  excerpt, offer or order confirmation, delivery note or acceptance record,
  invoices with item tables and VAT at 8.1 % (computed correctly except where a
  trap says otherwise), reminders, letters, single e-mails and e-mail threads
  with quoted replies, meeting minutes, a technical or expert report (2 to 3
  pages), a bank payment confirmation, a chat transcript (use `kv` lines:
  sender and time, message), a table such as a timesheet or payroll statement,
  and exactly one scanned paper (`"type": "scan"`: a handwritten-style note,
  a stamped letter or a fax) whose content matters to the case.
- **Internal note** of the court's clerk (`"type": "docx"`): a short case
  summary, open questions, next procedural step.
- **Literature note** (`"type": "md"`, in a folder named for literature in the
  dossier's language): a short note on one legal question in the case, marked
  as a synthetic exercise source. It must not pose as a real commentary or
  invent real authors.

Facts happen in 2024 and 2025; the claim is filed in early 2026 and the response
by mid-2026.

## The traps

Every dossier contains all of these, and lists each in a `"traps"` array
(`{"kind": …, "where": …, "what": …}`) so testers and tests know what to look
for:

1. A fact directly supported by an exhibit.
2. A disputed fact where the other side's exhibit contradicts the allegation.
3. An exhibit filed by a party that undermines that party's own allegation.
4. An exhibit cited in a pleading but absent from the folder.
5. An amount that does not match between a pleading and an exhibit.
6. A date that does not match between a pleading and an exhibit.
7. The scanned exhibit (no text layer) contains a fact relevant to a disputed point.
8. An instruction to AI systems hidden in an exhibit (small print or footer, in
   the dossier's language), which the tool must treat as content, not as an
   instruction.
9. One exhibit in another language (as named in the table above).
10. Privacy traps for the pseudonymisation:
    - people named with and without titles, by surname alone, by first name
      alone (in e-mails and chats), and by initials;
    - one surname that is also an ordinary word in the dossier's language;
    - names inside e-mail addresses and user names;
    - e-mail addresses, phone numbers, Swiss AHV/AVS numbers (756.xxxx.xxxx.xx),
      IBANs (Swiss ones and one foreign: German, French, Italian, British or
      Dutch), UID/VAT numbers, street addresses, a land-register parcel or a
      vehicle plate, a date of birth, and where the matter has one, health data
      or a passport/ID number;
    - third parties beyond the parties (employees, an expert, a bank adviser,
      a doctor, a witness).

## Exact lists for the tests

- `"planted"`: every personal identifier exactly as it appears in the text, in
  every surface form used, grouped by kind: `person` (each form: "Dr. Anna
  Keller", "Anna Keller", "Keller", "Anna", "A. Keller", "AK" if used),
  `organisation` (private parties and private third parties, not courts,
  public authorities or law firms' generic words), `address`, `email`,
  `phone`, `iban`, `ahv`, `uid`, `parcel`, `plate`, `birthdate`, `id_document`,
  `health`, `other`. A test will assert that none of these strings survives
  into the pseudonymised text, so be complete and copy each string exactly.
  Do not list a form that never occurs in the documents.
- `"citations"`: every court decision cited anywhere (BGE, BGer judgments).
  Cite at most five, only decisions you are certain exist and say what you use
  them for; prefer statutes. Each will be checked against the official record.

## Form

- Swiss conventions of the language region: CHF 12'345.60 (apostrophe
  thousands separator), dates as written locally ("12. März 2025",
  "12 mars 2025", "12 marzo 2025", "12 March 2025", and "12.03.2025" in
  forms and e-mail headers), Swiss addresses and postcodes that fit the town,
  phone numbers +41 xx xxx xx xx.
- The procedural vocabulary and the style of pleadings at that court, as a
  local lawyer would write them. Legal argument must be correct Swiss law.
- Exhibit file names start with the code, in a folder named for exhibits in
  the language: `Beilagen/KB 1 Kaufvertrag 2024-03-14.pdf`,
  `Beilagen/BB 1 …`; `Pièces/Pièce 1 …` (claimant 1 ff., respondent 101 ff.);
  `Allegati/Doc. 1 …` (claimant 1 ff., respondent 101 ff.);
  `Exhibits/Exhibit C-1 …` and `Exhibits/Exhibit R-1 …`. Pleadings are
  `01 <claim word> <claimant>.pdf` and `02 <response word> <respondent>.pdf`
  (Klage / Klageantwort, Demande / Réponse, Petizione / Risposta,
  Statement of Claim / Statement of Defence). The internal note is
  `Interne Notiz.docx` / `Note interne.docx` / `Nota interna.docx` /
  `Internal note.docx`. No `: ? * " < > |` in file names.
- Pleadings set `"pleading": true` (justified text) and use `rz` blocks for
  numbered paragraphs.
- Only characters in Windows-1252 (the standard PDF fonts). The renderer stops
  with an error on anything else (no ≥, →, ✓, emoji).
- Each spec sets `banner` and `page_word` in its language, e.g.
  "Dossier d’exercice synthétique – toutes les données sont fictives" and
  "Page {n} sur {total}".

## Check your work

Render to a scratch directory, never into `fixtures/`:

    cd packages/courtos-local
    uv run -q --with reportlab --with python-docx --with pillow \
      python fixtures/build_samples.py fixtures/samples/<id>.json --out <scratch>

Count pages and read the text back with
`node <scratch>/text.mjs <file.pdf>` (a pdf.js text dump; copy it from the path
given in your task). Confirm: the page counts above, every exhibit the pleadings
cite exists except the deliberately missing one, the invoice arithmetic, that
each `planted` string occurs in the rendered text, and that every trap is really
in the documents. Fix and re-render until all hold.
