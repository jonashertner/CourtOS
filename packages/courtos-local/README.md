# courtos-local: the case folder

One local case folder, a sanitised mirror of it, and a frontier-model agent that may read only that mirror. Results come back bound to the original pages, in the browser and in Word.

```
case folder (originals, read only)
   │  extract (PDF text layer, DOCX, text; OCR for scans)   on this computer
   ▼
.courtos/private/   extraction cache, pseudonym register, span maps
   │  citecheck finds what identifies a person; you review the register
   │  replace in four passes with the shared projection kernel
   ▼
.courtos/mirror/    pseudonymised pages with neutral labels in the language of the
                    proceedings (Klage / Demande / Petizione …, KB 1, S. 2 / p. 2)
   │  explicit release per folder: model, token limit, exact mirror hash
   ▼
agent loop          tools: list_documents · read · search · submit_result
                    (+ search_case_law · read_decision on OpenCaseLaw for legal tasks)
   │  every request: outbound guard, then stored verbatim in .courtos/runs/<id>/requests/
   ▼
Anthropic Messages API (Claude)
   │  submit_result → courtos-workflows validateWorkflowResult (exact quotes,
   │  party attribution, row structure); errors go back to the model to repair
   ▼
binder              quote → mirror offsets → span map → original page offsets,
                    page hash re-checked, real names restored for display only
   ▼
browser workspace and Word task pane on https://localhost:4311
```

## Run it

Node.js 22 or newer.

```sh
cd packages/courtos-local
npm install
node bin/courtos-local.mjs --demo          # synthetic dossier HG.2026.57, works without an API key
node bin/courtos-local.mjs ~/Akten/HG.2026.57
```

The terminal prints a pairing link; on macOS the browser opens it. Choose a folder with the native dialog, check roles, parties and the language of the proceedings under **Akten**, review the register under **Schutz**, release the folder, then run tasks under **Analyse**. The interface is available in German, French, Italian and English. The Anthropic API key is read from `ANTHROPIC_API_KEY` or saved through the interface to `~/.config/courtos/anthropic-key` (mode 0600).

Word on macOS:

```sh
npx office-addin-dev-certs install     # once; trusted certificate for https://localhost
node bin/courtos-local.mjs install-word
```

Restart Word; the **CourtOS › Fallordner** button appears on the Home tab. Pair it with the six-digit code from **Word verbinden** in the browser. In Word you can find the file passages for a selected sentence, insert a checked reference as a footnote, insert any analysis (tables, decision draft, orders) at the cursor in the language of the proceedings, check the BGE and judgment citations of the draft with citecheck, and see open deadlines.

Without `~/.office-addin-dev-certs` the server falls back to plain HTTP on loopback; the browser works, Word does not.

## What is implemented

| Part | State |
|---|---|
| Read-only folder inventory, symlinks and hidden files skipped, `.courtos/` workspace | done |
| Extraction: PDF text layer per page, DOCX paragraphs, text/Markdown | done |
| OCR for pages without a text layer: macOS Vision (compiled helper), else `pdftoppm` + `tesseract` | done; recognised pages are marked in every view and result |
| Anonymisation suggestions from the citecheck engine (vendored, `src/vendor/citecheck`), plus CourtOS rules: company core names, public offices listed as kept, AHV numbers always replaced, OCR-damaged common words not mistaken for names | suggestions for human review |
| Register: decisions, letter pseudonyms (A.________), labels, aliases, merge, manual additions, per-occurrence exceptions bound to the page version | done |
| Language of the proceedings (DE/FR/IT/EN): detected from the pleadings, changeable; document labels, page references and replacement labels follow it; exhibit codes stay as the parties wrote them | done |
| Mirror built with `packages/courtos-projection` (`compileTextTransformation`), four composed passes, private span maps | done |
| Release bound to mirror hash and register revision; any change to the folder or the language revokes it | done |
| Agent loop with mirror-only tools, read-before-quote rule, coverage from actual reads | done |
| Validation with `packages/courtos-workflows` (`validateWorkflowResult`, unchanged `system.txt`) and model repair | done |
| All eight guide tasks: chronology, claims and evidence, party comparison, legal arguments (with OpenCaseLaw), fundamental questions, decision draft, impact of an assumption, ask your sources; "Fall erschliessen" runs the first five in sequence | done |
| Case law: OpenCaseLaw search and full decisions in the browser and for the agent (public text, cached in `.courtos/public/`) | done |
| Citecheck of decision citations in the case file and in the Word draft (only the reference is sent) | done |
| Parties register (P1, P2 … with roles; names stay local) | done |
| Notes, questions, assumptions, contradictions with status and sources; selected notes go to Claude pseudonymised, as context, never as evidence | done |
| Procedure: deadlines and steps with sources, order template (no AI) in the language of the proceedings, issued orders | done |
| Binding to original page offsets, local name restoration, Markdown working notes in `.courtos/wiki/`, backup archive of the workspace | done |
| Browser workspace and Word task pane, pairing code, live trace, source drawer, audit of every sent request | done |
| Interface in German, French, Italian, English (`web/i18n.js`, coverage checked by `test/i18n.test.mjs`) | done |
| Folder watching (new or changed files are picked up, the release is revoked) | done |

## What it guarantees, and what it does not

Guaranteed by code and tests (`npm test`):

- Originals are never written. The test suite hashes every original before and after a full run.
- No registered original (any alias the user keeps replacing), no folder path, no file name and no unregistered e-mail, IBAN, AHV or phone pattern leaves in a request. A model turn that writes a real name stops the run before the next request is sent.
- A question typed in the browser or selected in Word is pseudonymised with the same register before it is sent.
- Every claim in a result carries a quotation that occurs exactly once on the cited page of the mirror and was read by the agent before it was quoted; every quotation resolves to an exact span on the original page.

Not guaranteed:

- **Pseudonymisation is not anonymisation.** Detection is heuristic. A name the detector misses, an unusual combination of facts, a profession or a place can still identify a person. The human review of the register and the page preview is part of the process, not an optional step.
- A matching quotation shows that the text is there, not that it supports the claim. Every result is a working draft.
- OCR text can be wrong. Recognised pages are marked; compare them with the original before relying on them. Handwriting and figures are not read reliably.
- Exhibit codes taken from file names ("KB 2", "pièce 4") are not translated when the language of the proceedings changes, because the pleadings cite them that way.

## Before real case files

The pilot is for public and synthetic material. For real files, the decision that the pseudonymised text may be processed by the chosen provider belongs to the court or authority (official secrecy, Art. 320 StGB; cross-border disclosure, Art. 16 ff. DSG; the cantonal rules on court IT). The provider is one class (`src/agent/providers.mjs`); an institution-hosted model with the same Messages-style tool interface can replace it without changing the guard, validator or binder.

## Layout

```
bin/courtos-local.mjs     CLI: start, --demo, install-word
src/scan.mjs              inventory, classification, neutral labels, path confinement
src/extract.mjs           PDF/DOCX/text extraction to canonical page text
src/anonymise.mjs         citecheck engine and CourtOS rules
src/detect.mjs            supplementary identifier patterns
src/language.mjs          language of the proceedings: labels, page words, detection
src/ocr.mjs               local OCR (Vision helper in scripts/, or tesseract)
src/opencaselaw.mjs       OpenCaseLaw search and decisions, cached
src/citecheck.mjs         citation lookup against OpenCaseLaw
src/backup.mjs            workspace backup archive
src/vendor/citecheck/     vendored citecheck (MIT), see PROVENANCE.md
src/register.mjs          private pseudonym register
src/mirror.mjs            four-pass transformation via the projection kernel
src/guard.mjs             outbound guard
src/search.mjs            BM25 over the mirror
src/agent/                tasks, loop, providers, offline demo script
src/verify.mjs            binding to originals, local name restoration
src/wiki.mjs              Markdown working notes
src/caseStore.mjs         one open case folder
src/server.mjs            loopback server (pairing, host/origin checks, SSE)
web/                      browser workspace and Word task pane
word/manifest.xml         Word add-in manifest
fixtures/                 synthetic dossier HG.2026.57 and its generator
test/                     node:test suites
```
