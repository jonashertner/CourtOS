# Building the CourtOS guide

`manuscript/content.json` is the source for four concise editions: German,
French, Italian and English. Each edition has ten PDF pages (180 × 270 mm)
and a complete digital reader. `build_web_reader.py` uses `folio-reader.js`
and `folio-reader.css`; `build_booklet.py` builds the PDFs and calls the same
web renderer. The retained legacy `reader.js` and `reader.css` are unused.
Deploy `output/` together under `/guide/`, preserving its relative paths.

The guide follows the actual research interface: public search, selected own
sources, partial submissions review, explicit local or external AI requests,
and the account-bound Word/browser research handoff. It distinguishes exact
quotation matching from semantic support, completeness and truth. No legal
source lookup is claimed for the submissions report: missing authorities
still require a separate search or manual check. Real confidential case files
remain outside this pilot. Direct filesystem access and consistent
pseudonymisation are future work. The guide does not certify model quality,
all Office hosts, institutional suitability or a productivity gain.

The first two chapters explain the judicial task and responsibility. Primary
references have individual source anchors, exact reviewed locators and limits
on what was reviewed. Source dialogs preserve chapter and focus. Without
JavaScript every reference leads to the same visible source entry. The PDFs
retain fixed pages, chapter bookmarks and source-entry destinations.

The default book view adapts the measured page reader from Jonas Hertner’s
published Rule & Reason book; see `reference-reader-provenance.json`. It
measures text after fonts load and shows one or two pages. Continuous reading
remains available, including without JavaScript. Viewport page numbers differ
from the PDF. Pagination fails back to the complete text when content cannot
fit. Local assets make no network calls; optional localStorage remembers only
the reading mode. Language changes preserve the corresponding chapter.
The former `quality`, `test`, `local` and `public` links remain supported.

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
`Mono.ttf` is the unchanged Paper Mono Regular. The helper checks a DE/FR/IT/EN
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
builder: `output/`, derived `manuscript/de.md`, `fr.md`, `it.md`, `en.md`, and
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
