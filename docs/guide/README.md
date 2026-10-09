# Building the CourtOS guide

`manuscript/content.json` is the editable source for all three languages.
`output/` contains the reviewed static guide and three seven-page B5 PDFs.
Deploy its contents together, preserving relative paths, under `/guide/`.
The web guide needs no build step, JavaScript or external assets to read.

The pilot edition describes email-code self-registration and the guided
workflow's current per-person UTC-day limits: three local jobs and one external
analysis. These statements require the matching deployment configuration;
review them if access policy or quotas change. The timing example is one complete
native assistant run with verified synthetic-PDF citations (about six and a half
minutes), not a benchmark or guaranteed wait.

## Rebuild

Tested with Python 3.12, ReportLab 4.4.9 and pypdf 6.10.0.
In a virtual environment:

```sh
python -m pip install reportlab==4.4.9 pypdf==6.10.0
COURTOS_GUIDE_FONT_DIR=/path/to/fonts python build_booklet.py
```

The font directory must contain these **static TrueType** files; subdirectories
are searched:

- `NotoSans-Regular.ttf`
- `NotoSans-Bold.ttf`
- `Caladea-Regular.ttf`
- `Caladea-Bold.ttf`

Use the Noto Sans and Caladea font distributions and retain their accompanying
licences when redistributing font files. Fonts are not downloaded by the builder.
If the environment variable is omitted, the builder searches common Linux,
macOS and Windows font directories. It fails before writing files if a required
font is missing; it does not substitute a different typeface. Exact typography
depends on the font files and library versions, so review a rebuilt edition.

The command can run from any working directory. It writes relative to the
builder: `output/`, derived `manuscript/de.md`, `fr.md`, `it.md`, and
`qa/build-report.json`. It overwrites generated files. To keep the reviewed
edition untouched while testing, first copy this directory to a temporary
location and build there.

## Verification and metadata

The builder checks seven pages per language, page overflow, basic text
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
