# Demo dossiers: brief for authors

Two dossiers for a demonstration video shown to judges, clerks and court
administrators who have never seen CourtOS. They watch a few minutes of the tool
working on a case and decide whether it understands their work. The case must
therefore be the kind they handle every week, written so well that a clerk at
that court would take it for a real file with the names changed.

Everything in `BRIEF.md` applies (spec format, form, Windows-1252, the
`planted` and `citations` lists, checking your work), except where this brief
says otherwise. Where they differ, this brief wins.

## The two dossiers

| id | language | court | matter |
|---|---|---|---|
| `zh-vertrieb` | de | Handelsgericht des Kantons Zürich | Two Swiss companies over an exclusive distribution agreement. A Zurich manufacturer of professional coffee machines terminated, without notice and for cause, the exclusive distribution agreement of its distributor for Ticino and Graubünden after a dispute about sales targets and a competing product line. The distributor claims damages for the lost notice period, a customer-base indemnity by analogy to Art. 418u OR, and the buy-back of its stock; the manufacturer pleads good cause (Art. 337/418r OR by analogy, breach of the non-compete), contests the indemnity, and counterclaims unpaid invoices for delivered machines. Value in dispute about CHF 700'000 to 900'000. |
| `bger-permis` | fr | Tribunal fédéral, Ire Cour de droit public, Lausanne | A recours en matière de droit public (art. 82 ss LTF) of neighbours against a judgment of the Cour de droit administratif et public (CDAP) of the Tribunal cantonal vaudois that upheld a municipal building permit for two semi-detached houses with outdoor air-water heat pumps, replacing an old villa. Issues as the Federal Supreme Court sees them: standing of the more distant neighbour (art. 89 al. 1 LTF); the right to be heard (art. 29 al. 2 Cst.: the CDAP relied on a document the recourants never saw); arbitrary application of the communal regulation on boundary distance and height (art. 9 Cst., only arbitrariness is reviewed); the heat pumps' noise under federal environmental law (art. 11 LPE, OPB annex 6), which the court reviews freely; facts allegedly established in a manifestly inaccurate way (art. 97 LTF). Parties: the recourants; the constructeurs as intimés; the Municipalité; the Tribunal cantonal (CDAP) as autorité précédente; the Federal Office for the Environment (OFEV) asked for its observations. |

**Names and anonymisation.** The demo shows CourtOS replacing every name and
identifier before a model reads the file. Every document therefore uses full,
natural Swiss names and identifiers, exactly as a real file does: parties,
their directors and employees, counsel, the architect, the engineer, the
neighbours, municipal staff, witnesses; addresses, phone numbers, e-mail
addresses, IBANs, UID numbers, land-register parcels, dates of birth where a
document would carry one. The folder and file names carry party names too, as
real case folders do. Names appear in all their forms (with title, surname
only, first name in e-mails and chats, initials, in e-mail addresses).

In `bger-permis` the commune is fictional: choose a plausible Vaud commune name
that does not exist, with a fictional communal regulation (a "Règlement sur le
plan général d'affectation et la police des constructions", RPGA). Cantonal and
federal law is real and must be applied correctly. In `zh-vertrieb` the city
and court are real; companies and people are fictional.

## What makes it a good demo case

- **Ordinary, not exotic.** One clear dispute with three or four live issues, as
  in an average file. No exotic law, no unusual procedure.
- **Real procedure and style.** The pleadings read as a lawyer at that court
  writes them; the authority's documents read as a municipal office writes them;
  correspondence reads as people write it. Correct procedural vocabulary of the
  court (Zurich Commercial Court: Rechtsbegehren, Gerichtskostenvorschuss,
  Instruktionsverhandlung, Widerklage …; Federal Supreme Court: recours en
  matière de droit public, griefs, pouvoir d'examen, arbitraire, avance de
  frais, effet suspensif, observations; and in the cantonal file: avis
  d'enquête publié dans la FAO, synthèse CAMAC, levée d'opposition,
  inspection locale …).
- **Two sides that both have a point.** A judge watching must not see at once
  who wins. Each side has one strong argument and one weak one.
- **Natural findings instead of traps.** Each dossier has these, listed in the
  spec's `"traps"` array as in `BRIEF.md`, but they must arise naturally and
  never look planted:
  1. A fact directly supported by an exhibit.
  2. A disputed fact where the other side's exhibit contradicts the allegation.
  3. An exhibit filed by a party that weakens that party's own position.
  4. An exhibit cited in a pleading but absent from the folder.
  5. An amount that does not match between a pleading and an exhibit.
  6. A date that does not match between a pleading and an exhibit.
  7. The scanned document (no text layer) contains a fact relevant to a disputed point.
  8. One document in another national language (`zh-vertrieb`: Italian, e.g.
     from the Ticino distributor's sub-dealer or customer; `bger-permis`: the
     German noise report).
  9. Privacy: people named with and without titles, by surname, by first name
     in e-mails, by initials; names inside e-mail addresses; addresses, phone
     numbers, e-mail addresses, IBANs and UID numbers (`zh-vertrieb`),
     land-register parcels (`bger-permis`), a date of birth or an AHV number only where such a document would
     really carry one; third parties (an expert, an architect, a subcontractor,
     municipal staff, a neighbour).
- **No hidden instruction to AI systems** (trap 8 of `BRIEF.md` is dropped).

## Documents

### `zh-vertrieb`

Folder `HG260xxx-O <Klägerin short name>` (Zurich Commercial Court numbers look
like `HG260031-O`).

- `01 Klage <Klägerin>.pdf` 9 to 12 pages; `02 Klageantwort und Widerklage
  <Beklagte>.pdf` 8 to 11 pages; `03 Replik und Widerklageantwort
  <Klägerin>.pdf` 4 to 6 pages; `04 Duplik und Widerklagereplik <Beklagte>.pdf`
  3 to 5 pages. Each answers the other paragraph by paragraph as a Zurich
  commercial litigator would (Rechtsbegehren, Zuständigkeit Art. 6 ZPO and the
  forum clause, Streitwert, no conciliation before the Commercial Court,
  Tatsachenbehauptungen in Randziffern with "Beweis: KB 4", Bestreitungen,
  rechtliche Ausführungen).
- `Beilagen/KB 1 …`, `Beilagen/BB 1 …`: 16 to 20 exhibits in all, e.g. the
  distribution agreement (4 to 5 pages, serif) with its annex of sales targets,
  the price list, purchase orders and invoices (VAT 8.1 %), the sales
  statistics, e-mail threads, minutes of the annual review meeting, the warning
  letter, the termination letter, the reply, the stock list at termination, an
  accountant's or expert's calculation of the lost profit, a bank payment
  confirmation, a WhatsApp chat between the managers, a trade-fair flyer of the
  competing product line, and the one scan (e.g. a handwritten note of a
  meeting or a stamped registered-mail receipt).
- `Interne Notiz.docx` of the Gerichtsschreiberin or the instructing judge:
  summary, disputed points, open questions, next step (e.g. Instruktions- und
  Vergleichsverhandlung, Beweisverfügung).
- `Literatur/<topic> (synthetisch).md`: a short synthetic note (e.g. the
  customer-base indemnity of the exclusive distributor by analogy to Art. 418u OR).

### `bger-permis`

Folder `1C_xxx_2026 <recourants' surname>` (the Federal Supreme Court's numbers
look like `1C_412/2026`; a folder name cannot hold "/").

- `01 Recours en matière de droit public <recourants>.pdf` 8 to 10 pages
  (conclusions, recevabilité: art. 82, 86, 89, 90, 100 LTF; griefs as the
  Federal Supreme Court's review requires them: art. 95, 97, 106 al. 2 LTF;
  request for effet suspensif).
- `02 Réponse <constructeurs>.pdf` 5 to 7 pages (by their counsel).
- `03 Observations Municipalité de <commune>.pdf` 2 to 3 pages.
- `04 Observations Tribunal cantonal.pdf` 1 page (the CDAP refers to its
  judgment, perhaps with one remark).
- `05 Observations OFEV.pdf` 2 to 3 pages (on the heat pumps under the OPB).
- `06 Réplique <recourants>.pdf` 2 to 4 pages.
- `Pièces/Pièce 1 …` ff. for the recourants: Pièce 1 is the contested CDAP
  judgment (an arrêt of 7 to 9 pages, in the CDAP's form: composition, parties,
  objet, faits A. B. C., considérants 1. 2. 3., dispositif, voies de recours).
  `Pièces/Pièce 101 …` ff. for the constructeurs.
- `Dossier cantonal/Pièce 201 …` ff.: the cantonal file, 9 to 12 documents: the
  permit application form, the avis d'enquête published in the FAO, the site
  plan and one elevation as **drawings** (block type `drawing` in
  `build_samples.py`, with parcel numbers, boundary distances and heights that
  matter to the dispute, a north arrow and a title block), the opposition
  letter, the synthèse CAMAC, the municipal decision lifting the opposition and
  granting the permit, the minutes of the CDAP's inspection locale, the heat
  pumps' noise report (in German, by the constructeurs' Swiss-German
  engineer), an extract of the RPGA, the land-register extract. The scan is
  one of these (e.g. the stamped opposition letter, or handwritten minutes).
- `Note interne.docx` of the greffier: summary, recevabilité, the questions,
  proposed outcome options, next step.
- `Doctrine/<sujet> (synthétique).md`: a short synthetic note (e.g. standing of
  neighbours before the Federal Supreme Court, or heat-pump noise under the OPB).

Both dossiers: 22 to 30 files, every document with the letterhead, signature
and form of what it poses as.

## Check your work

As in `BRIEF.md`. Render to a scratch directory, never into `fixtures/`, and read
the text back with `node /private/tmp/claude-501/demo-text.mjs <files>` (prints
each page as CourtOS extracts it; a scan prints as empty). Check every drawing
visually (`pdftoppm -r 70 -png file.pdf out` and look at the image).
