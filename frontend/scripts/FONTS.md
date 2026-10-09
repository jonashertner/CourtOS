# CourtOS typefaces

The web app embeds **Timeless Serif**, **Timeless Sans** and **Paper Mono** locally.
There is no browser request to a font CDN. Timeless Sans is the current family
name supplied by the publisher; we do not relabel it as Timeless Grotesk.
Inter and EB Garamond remain the OFL fallbacks if the separately licensed
Timeless assets have not been installed.

## Timeless — separate embedding licence

Publisher: <https://www.timeless.co/type>.
Licence checked on 9 October 2026: **Timeless Free Font License v1.2,
18 September 2026**, <https://www.timeless.co/type/license>.
Section 5.3 permits embedding in websites, apps and documents, including the
technical conversions necessary for embedding. Sections 5.4 and 6 restrict
font modification and redistribution. This is not an OFL font and is not covered
by CourtOS's AGPL licence. Do not add its binaries or licence documentation to
the public source repository or redistribute them as a standalone font pack.

After reviewing and accepting the publisher's terms for your work, run from the
repository root, before the web production build:

```sh
python3 frontend/scripts/fetch-timeless-fonts.py --accept-license
cd frontend
npm ci
npm run build
```

The script verifies every original variable WOFF2 against the immutable official
URL, byte count and SHA-256 in `timeless-fonts.json`. A changed or missing asset
fails rather than silently substituting another version. The fonts and a local
licence capture are written under the gitignored `frontend/public/fonts/timeless/`.
Deploy that directory **as part of the built application**. Do not publish it as
a font-download offering. A source checkout alone intentionally omits these
separately licensed assets; the interface remains usable with its OFL fallbacks.
No stylistic font modification or renamed derivative is performed by this web
build. The guide's separate technical PDF embedding procedure is documented in
`docs/guide/README.md`.

## Paper Mono — OFL 1.1

Official project: <https://paper.design/mono> and
<https://github.com/paper-design/paper-mono/tree/e6eaeceaef02e77e3db997711e07a16378de2bd7>.
Files under `src/app/fonts/paper-mono/` are original upstream assets from that
commit (`fonts/webfonts/` and `fonts/ttf/`). `PaperMono-Variable.woff2` is the
original `PaperMono[wght].woff2`, with only the filename changed. Retain the
bundled `OFL.txt`, `LICENSE.txt` and `AUTHORS.txt` with redistribution.
Paper Mono is Copyright 2025 Lost Coast Labs (Paper Design), based on Geist Mono
Copyright 2023 Vercel Inc. / basement.studio. It is used for compact source,
folio and status details, not long reading passages.
