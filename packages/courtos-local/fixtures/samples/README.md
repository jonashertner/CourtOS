# Sample dossiers

The case folders in `fixtures/` are synthetic. Every person, company, address
and number in them is invented, and every page carries a banner that says so.
The courts are real; their judges and clerks are not.

| file | what it is |
|---|---|
| `<id>.json` | One dossier: its pleadings, exhibits, internal note and literature note as blocks of text, plus two lists. `planted` holds every personal identifier the text contains, in each form it is written; a test asserts that none of them reaches the pseudonymised mirror. Health data is listed too but not checked: it is not replaced, because it names nobody once the person is. `citations` holds the court decisions the dossier cites and what each is cited for. |
| `../build_samples.py` | Renders a spec into the PDFs, the Word file and the Markdown note of its case folder. Its docstring documents the spec format. |
| `../build_dossier.py` | Builds the short demo dossier HG.2026.57 Alpenblick, which predates the spec format. |
| `BRIEF.md` | The brief the four language samples (`sg-maschine`, `vd-fiduciaire`, `ti-lavoro`, `be-software`) were written from: size, documents, the traps each must contain, and how to check the result. |
| `DEMO.md` | The brief for the two video dossiers (`zh-vertrieb`, `bger-permis`). |
| `VIDEO.md` | Storyboard and narration of the two demo videos. |

The briefs were written as instructions to the authors of the dossiers, which
is why they address the reader as "you". They are kept so that anyone can see
what the samples were meant to test and how they were made.

To rebuild a dossier into a scratch folder (the default writes into
`fixtures/`, replacing what is there):

```sh
cd packages/courtos-local
uv run --with reportlab --with python-docx --with pillow \
  python fixtures/build_samples.py fixtures/samples/vd-fiduciaire.json --out /tmp/samples
```

`npm test` checks that every listed sample ships with the package
(`test/samples.test.mjs`) and that the planted identifiers do not survive
pseudonymisation (`test/privacy.test.mjs`).
