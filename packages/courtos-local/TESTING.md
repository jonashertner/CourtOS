# Testing courtos-local

Thank you for testing. This page covers installing, what to try, where your data goes, and how to report a problem. The README explains how the tool works.

CourtOS is a pilot. Try it with the sample dossiers that come with it: they are synthetic, so they need no data-protection review. Opening real case files needs the decision of your court or authority that the pseudonymised text may be sent to the model you choose (see «Before real case files» in the README). A model running on your own computer avoids sending case text out at all.

CourtOS is free software under the AGPL-3.0 and comes without warranty. Its results are working drafts, not decisions.

## What you need

- **macOS** is the full experience: folder dialog, Word add-in, and text recognition for scanned pages. The Word add-in also works on Windows. On Linux or Windows you give the folder on the command line and open the printed link yourself.
- **Node.js 22.12 or newer** (`node -v`).
- **A model.** An Anthropic API key, a key for another OpenAI-compatible service, or a model on your own computer (Ollama, LM Studio). The demo runs without any.
- **git**, to download the source.
- **Word for Mac or Windows** (optional), for the task pane.
- **For scanned pages:** on macOS the Xcode command-line tools (`xcode-select --install`); on Linux or Windows `tesseract` and `pdftoppm`.

## Install and start

```sh
git clone https://github.com/jonashertner/CourtOS.git
cd CourtOS/packages/courtos-local
npm install
node bin/courtos-local.mjs --demo
```

No installer is published yet. If you received a packaged build (`courtos-local-0.1.0.tgz`) instead, install it with `npm install -g ./courtos-local-0.1.0.tgz` and start it with `courtos-local --demo`. In a source checkout, write `node bin/courtos-local.mjs` wherever this page says `courtos-local`.

The terminal prints a link with `#pair=…`; on macOS the browser opens it. The demo opens a synthetic commercial-court dossier (HG.2026.57 Alpenblick), copied to the system's temporary folder so the package is never written to. `courtos-local --sample <id>` opens another sample dossier, in German, French, Italian or English; the README lists them.

To open your own folder: `courtos-local ~/path/to/case-folder`, or choose it in the browser.

- **Stop:** Ctrl-C in the terminal.
- **Another port:** `courtos-local --port 4321` (the default is 4311). If the port is taken, the start says so.
- **Uninstall:** `npm uninstall -g @courtos/local`. This leaves your settings and case data in place; see below for where they are.

## Word

```sh
npx office-addin-dev-certs install     # once: a trusted certificate for https://localhost
courtos-local install-word             # registers the add-in with Word
```

Restart CourtOS and Word. **CourtOS › Fallordner** appears on the Home tab. Connect it with the six-digit code from **Word verbinden** in the browser. If CourtOS runs on another port, pass the same `--port` to `install-word`.

Without the certificate the start prints a notice: the browser works, Word does not.

## What to try

1. In the demo, look through **Akten**: roles, parties, the language of the proceedings. Open an original with the reader.
2. Under **Schutz**, review the register of names that will be replaced, then release the folder for a model.
3. Under **Analyse**, run a chronology. Click a quotation to jump to its page in the original. Without a model, the demo runs the chronology, facts and evidence, and a question to the files from a recorded script; the other tasks (party comparison, legal claims, decision draft …) need a model.
4. In Word, insert a table or the draft at the cursor, and check how it is set.
5. Open a sample case in another language: the interface switches to the language of the proceedings. Switch it back if you prefer, and try dark mode (the moon icon).

Things we most want to hear about: a name or identifier that was not replaced; a quotation that leads to the wrong place; anything confusing, slow or hard to read; how the inserted text looks in Word.

## Where your data is, and what leaves your computer

**On your computer**

| Where | What |
|---|---|
| `~/CourtOS/<case>/` | The case's work folder, proposed when you add a case. You can choose another folder, or the originals' folder itself. |
| `<work folder>/Arbeitsprodukte/` | Each result as a Word and a Markdown file, **with real names**. The folder is named in the language of the proceedings (`Travaux`, `Lavori`, `Work products`). |
| `<work folder>/.courtos/private/` | Extracted text, and the register that maps pseudonyms to **real names**. |
| `<work folder>/.courtos/mirror/` | The pseudonymised pages that the model may read. |
| `<work folder>/.courtos/runs/` | Each run. `requests/` holds every request exactly as it was sent: pseudonymised. `run.json` and `result.json` hold the result for display here, **with real names restored**. |
| `<work folder>/.courtos/memory/` | The case memory, **with real names**. |
| `~/.config/courtos/` | Your API keys (plain text, readable only by your user), the list of cases, preferences. |
| System temporary folder, `courtos-demo/` | The sample case files. |

Originals are never changed. CourtOS writes only into the work folder; if you chose the originals' folder as the work folder, that means `.courtos/` and the work-products folder inside it.

If the work folder is in iCloud Drive, OneDrive, Dropbox or a network share, **it is synced, including the register of real names.** CourtOS warns when it detects this. Keep work folders out of synced locations, or remove them when you are done.

**Sent over the network**

- **To the model you released, and only after you release it:** the pseudonymised pages it chooses to read, your question (pseudonymised with the same register), and the task instructions. With a model on your own computer, this stays on your computer.
- **To OpenCaseLaw** (`mcp.opencaselaw.ch`): for legal tasks, the search terms the model chooses (checked by the same guard); for the citation check in Word, only the public reference of each cited decision, such as BGE 129 I 232. Not your case text.
- **In Word only:** the task pane loads Microsoft's Office.js library from Microsoft.

There is no telemetry. CourtOS does not report usage to anyone.

**Pseudonymisation is not anonymisation.** Detection is heuristic. Review the register before you release a folder, and report anything that slipped through.

## Reporting a problem

Open an issue at https://github.com/jonashertner/CourtOS/issues. Issues are public. Please include:

- macOS / Linux / Windows and version, `node -v`, and whether it happened in the browser or in Word;
- what you did, what you expected, and what happened;
- the terminal output, if there is an error.

**Never include real case content**: no files from `.courtos/`, no request bodies, no screenshots or copied text from a real case. With the demo dossier, screenshots are fine.

Security problems go privately through the repository's **Security › Report a vulnerability**, not in a public report.
