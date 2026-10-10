# Building the CourtOS guide

`manuscript/content.json` is the editable source for all three languages. `build_web_reader.py` renders HTML from it using `folio-reader.js` and `folio-reader.css`; `build_booklet.py` calls the same renderer after building PDFs. The retained legacy `reader.js`/`reader.css` are not used by the new build.
`output/` contains the reviewed static guide and three fourteen-page PDFs (180 × 270 mm).
Deploy its contents together, preserving relative paths, under `/guide/`.
The web guide works without JavaScript and uses local font assets. The continuous reader adapts to phone, tablet and desktop. The default book view adapts the measured page reader from Jonas Hertner’s published Rule & Reason book (pinned provenance in `reference-reader-provenance.json`). It measures text after fonts load, splits at word boundaries and shows one or two pages. Continuous reading remains available. Its page numbers depend on the viewport and are not PDF page numbers. If a block cannot fit, it returns to the complete continuous text rather than clipping it.

Each numbered reference has an individual source anchor. With JavaScript it opens a native dialog containing the existing source link, exact reviewed locator and scope limitation; Escape returns focus to the citing reference without changing the reading position. Without JavaScript the same reference leads to its source entry. Original links in these entries open a separate tab. Native dialogs, chapter navigation and responsive page controls use local `reader.js`, with no network calls. Optional localStorage remembers only the reading mode; it stores no reading history or document content. The three PDFs retain fixed fourteen-page pagination and individual source-entry destinations. Neither layout certifies a source claim or removes the stated review limits.

The edition begins with four source-grounded chapters on purpose, judicial
responsibility, reviewable work and evaluation. The practical entry is now
`/research`: search published OpenCaseLaw decisions, inspect the original and
copy a passage together with provenance into the reader's usual tools. No
project or chat is required for this work. Public search calls the existing OpenCaseLaw service, which can use external AI for query analysis and ranking; that transmission is disclosed before submission. `/knowledge` remains a
compatible route; personal source import and management use `/library`.
Public and personal search keep separate inputs and source scopes.

The copy action returns plain text. For public decisions the user first marks
20–800 contiguous characters and explicitly accepts that selection. Copying
includes only the selected passage, decision metadata, safe public source/PDF
URL when available, OpenCaseLaw identifier and character-position context
(not official paragraph numbers). Personal-source copies include the quote,
filename, immutable version, PDF page and an authenticated link to that exact
version and page. The link does not grant access to another account and is not
a signed storage URL. A manual text field is offered when clipboard access
fails. These references remain subject to checking against the original;
copying does not certify correctness, establish a proposition or confer source
rights. The chronology action prepares a draft for a small, fully readable PDF
selection; it does not send automatically. The stated verification requirement
distinguishes matching quotation text from whether it supports a factual or
legal claim.

Beyond public search, separate AI work remains optional: explicit personal-source
selection for local Gemma 4 work on the CourtOS server, or a separately reviewed
Claude Opus 5.5 request to Anthropic followed by an editable return to the local
composer without automatic sending. Public passages can enter that same
reviewed hand-off. Links identify sources; the external request does not fetch
their contents. The institutional-planning chapter records a future case-file requirement:
original pleadings and exhibits in an approved local environment, or a separately
reviewed cross-document pseudonymisation process before frontier use. This does
not establish anonymity. Consistent
aliases, a local mapping and residual-identification review are requirements,
not current capabilities. A future approved local case folder would read originals
without altering them and keep readable working notes alongside them. Notes would
distinguish findings, allegations and disputed points, link source versions and
flag dependencies for review when sources change. The current library uploads
copies to the VPS; in-place filesystem access and a local Word/browser connector
are not implemented. No automatic anonymisation or general Word acceptance is claimed. A synthetic Word for macOS test verified sign-in, exact-citation research, selected-passage insertion and the account-bound browser roundtrip, including a concurrent-edit conflict. Other Office versions, private-source roundtrips and institutional environments need their own acceptance tests. Citecheck remains separately linked. The guide no longer prescribes the former Linden case.

The guide describes email-code self-registration and the current separate
per-person UTC-day limits: three native local assistant starts and one external
analysis. These statements require the matching deployment configuration;
review them if access policy, models or quotas change. An earlier measured local
PDF run is mentioned only as evidence that CPU work can take several minutes,
not as a performance benchmark or guaranteed wait. The current practical edition
is dated 10 October 2026.

## Rebuild

Tested with Python 3.12, ReportLab 4.4.9, pypdf 6.10.0,
fontTools 4.60.1 and Brotli 1.1.0. In a virtual environment:

```sh
python -m pip install reportlab==4.4.9 pypdf==6.10.0 fonttools==4.60.1 brotli==1.1.0
python ../../frontend/scripts/fetch-timeless-fonts.py --accept-license
python prepare_fonts.py
COURTOS_GUIDE_FONT_DIR=.font-cache python build_booklet.py
python -m unittest discover -s . -p test_prepare_fonts.py
# With the frontend development dependencies already installed:
node --test test_reader.cjs
```

`prepare_fonts.py` obtains the original variable Timeless WOFF2 files directly
from the official, SHA256-pinned URLs in
`frontend/scripts/timeless-fonts.json`. To reuse already downloaded originals
without network access, pass `--font-dir /path/to/originals`; that directory must
contain `TimelessSerif-Variable.woff2` and `TimelessSans-Variable.woff2`, with
exactly the pinned hashes. It never installs system fonts.

The official fetcher is a prerequisite in a fresh checkout: read the linked
licence before using `--accept-license`. It obtains the licence locally alongside
the official fonts. The full Timeless licence and binaries are intentionally
absent from the public repository; the helper fails with the required command
if that local licence copy is missing.

For the PDF builder, `.font-cache/` contains `Serif.ttf`, `SerifBold.ttf`,
`Sans.ttf`, `SansBold.ttf` and `Mono.ttf`. The Timeless instances fix weights
400 and 600 solely for the static TrueType embedding required by ReportLab;
other axes remain at their official defaults. Internal font names are preserved.
`Mono.ttf` is the unchanged Paper Mono Regular. The helper checks a DE/FR/IT
accented-text sample; optional arrow coverage is reported rather than assumed.
Its local `font-report.json` records hashes and glyph checks.

For the web guide, `output/fonts/` receives the **unchanged** variable originals
as `TimelessSerifVF.woff2` and `TimelessSansVF.woff2`, together with their licence,
and Paper Mono Regular plus `PaperMono-OFL.txt`. The Timeless binaries and local
cache are gitignored. Run the helper during the site/PDF build; do not add these
binaries to the public repository or a downloadable source archive.

### Font licensing and distribution

Timeless is free for personal and commercial use, but is **not open source**.
The [official licence](https://www.timeless.co/type/license), version 1.2 of
18 September 2026, permits work-specific embedding and technical embedding
conversions (§5.3); other variants must use the publisher's configurator (§5.4).
This helper's static instances are temporary PDF-embedding intermediates, not
new font products. Do not rename internal font identities or reuse those
intermediates as general-purpose font variants.

Distribute the resulting PDFs or the complete guide website, with web fonts
used only as its embedding assets. Do not publish naked Timeless font files,
a font mirror, or a font archive in the public Git repository (§6). Keep the
licence with work-specific font assets supplied to collaborators. Anyone who
wants the fonts themselves should obtain them from Timeless. Paper Mono has a
separate SIL Open Font License; keep its OFL with redistributed font files.
The guide's content and repository licence do not relicense either font family.

The command can run from any working directory. It writes relative to the
builder: `output/`, derived `manuscript/de.md`, `fr.md`, `it.md`, and
`qa/build-report.json`. It overwrites generated files. To keep the reviewed
edition untouched while testing, first copy this directory to a temporary
location and build there.

## Verification and metadata

The reader regression tests verify exact-source routing, retained source scope, chapter/language navigation, no-JavaScript anchors and safe pagination fallback. Responsive browser QA must also check actual measured page overflow, keyboard focus return, content navigation, and phone/tablet/wide views after fonts load.

The builder checks that each language has one PDF page per manuscript section, page overflow, basic text
extraction, local HTML targets and section anchors. Render the PDFs and inspect
changed pages before publication, for example with Poppler:

```sh
pdftoppm -png output/pdf/courtos-de.pdf /tmp/courtos-de
```

Preserve the metadata-clearing step: final PDFs have neither an Info dictionary
nor XMP metadata. Title, author, subject, keywords and producer metadata remain
empty. The PDF language code and visible document headings are intentionally
retained. HTML title and author metadata are also empty. The builder verifies
the PDF metadata policy after writing and records hashes in the QA report.

PDFs contain selectable text and embedded fonts; they are not tagged PDFs and
have not been certified for accessibility. Changing text, fonts or layout
requires renewed visual review. The guide describes a dated synthetic pilot,
not an approval to process real court files.
