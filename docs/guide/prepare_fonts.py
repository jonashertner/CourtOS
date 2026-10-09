#!/usr/bin/env python3
"""Prepare licensed guide embedding assets; never install or publish fonts alone.

Timeless originals are hash-pinned by frontend/scripts/timeless-fonts.json.
Static instances exist only in .font-cache as a technical PDF embedding step.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import urllib.parse
import urllib.request

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
CACHE = HERE / '.font-cache'
OUTPUT = HERE / 'output' / 'fonts'
LICENSE_SOURCE = REPO / 'frontend/public/fonts/timeless/LICENSE.txt'
MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024
PINNED = {
    'TimelessSerif-Variable.woff2': ('TimelessSerifVF.woff2', [('Serif.ttf', 400), ('SerifBold.ttf', 600)]),
    'TimelessSans-Variable.woff2': ('TimelessSansVF.woff2', [('Sans.ttf', 400), ('SansBold.ttf', 600)]),
}
LANGUAGE_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÄÖÜäöüÀÂÆÇÉÈÊËÎÏÔŒÙÛŸàâæçéèêëîïôœùûÿÌÒìò«»–—’'
OPTIONAL_GLYPHS = '→←↗'
IDENTITY_NAME_IDS = {1, 2, 3, 4, 6, 16, 17}


def verify(data: bytes, record: dict) -> bytes:
    if len(data) != record['bytes'] or hashlib.sha256(data).hexdigest() != record['sha256']:
        raise ValueError(f"Font does not match pinned official bytes: {record['file']}")
    return data


def source_bytes(record: dict, font_dir: Path | None, cache: Path) -> bytes:
    if font_dir is not None:
        return verify((font_dir / record['file']).read_bytes(), record)
    stored = cache / 'originals' / record['file']
    if stored.exists():
        return verify(stored.read_bytes(), record)
    parsed = urllib.parse.urlsplit(record['url'])
    if parsed.scheme != 'https' or parsed.netloc != 'www.timeless.co' or parsed.username:
        raise ValueError('Font URL must be on the official HTTPS host')
    with urllib.request.urlopen(record['url'], timeout=30) as response:
        if urllib.parse.urlsplit(response.url).netloc != 'www.timeless.co':
            raise ValueError('Font redirect left the official host')
        data = response.read(MAX_DOWNLOAD_BYTES + 1)
    if len(data) > MAX_DOWNLOAD_BYTES:
        raise ValueError('Font download exceeds limit')
    verify(data, record)
    stored.parent.mkdir(parents=True, exist_ok=True)
    stored.write_bytes(data)
    return data


def identity_names(font) -> dict:
    return {(n.nameID, n.platformID, n.platEncID, n.langID): n.toUnicode()
            for n in font['name'].names if n.nameID in IDENTITY_NAME_IDS}


def glyph_report(font) -> dict:
    cmap = font.getBestCmap() or {}
    missing = sorted(set(LANGUAGE_GLYPHS) - {chr(code) for code in cmap})
    if missing:
        raise ValueError('Missing DE/FR/IT text glyphs: ' + ''.join(missing))
    return {'de_fr_it_sample': 'passed',
            'optional_arrows': {c: ord(c) in cmap for c in OPTIONAL_GLYPHS}}


def prepare(font_dir: Path | None = None) -> dict:
    if not LICENSE_SOURCE.is_file():
        raise SystemExit('First read/accept the Timeless licence: from the repository root run python frontend/scripts/fetch-timeless-fonts.py --accept-license. The full licence is retained locally, not in public Git.')
    try:
        from fontTools.ttLib import TTFont
        from fontTools.varLib.instancer import instantiateVariableFont
    except ImportError as error:
        raise SystemExit('Install fonttools==4.60.1 brotli==1.1.0 in your build virtual environment.') from error
    from io import BytesIO
    manifest = json.loads((REPO / 'frontend/scripts/timeless-fonts.json').read_text())
    CACHE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    report = {'license_url': manifest['license_url'], 'license_version': manifest['license_version'],
              'purpose': 'Technical PDF/web embedding only; no standalone font distribution', 'files': {}}
    for record in manifest['files']:
        if record['file'] not in PINNED:
            continue
        web_name, instances = PINNED[record['file']]
        data = source_bytes(record, font_dir, CACHE)
        # Web output is the unmodified official variable WOFF2, never the TTF instance.
        (OUTPUT / web_name).write_bytes(data)
        for filename, weight in instances:
            font = TTFont(BytesIO(data), recalcTimestamp=False)
            names = identity_names(font)
            axes = {axis.axisTag: axis.defaultValue for axis in font['fvar'].axes}
            assert 'wght' in axes, 'Expected official weight axis'
            axes['wght'] = weight
            font = instantiateVariableFont(font, axes, inplace=True, updateFontNames=False)
            assert identity_names(font) == names, 'Font identity/name must remain unchanged'
            assert 'fvar' not in font, 'PDF embedding file must be static'
            font.flavor = None
            output = CACHE / filename
            glyphs = glyph_report(font)
            font.save(output, reorderTables=True)
            font.close()
            report['files'][filename] = {'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                                         'weight': weight, 'identity_names_preserved': True, **glyphs}
    paper = REPO / 'frontend/src/app/fonts/paper-mono'
    for source, target in [(paper/'PaperMono-Regular.ttf', CACHE/'Mono.ttf'),
                           (paper/'PaperMono-Regular.woff2', OUTPUT/'PaperMono-Regular.woff2'),
                           (paper/'OFL.txt', OUTPUT/'PaperMono-OFL.txt')]:
        shutil.copyfile(source, target)
    with TTFont(CACHE/'Mono.ttf') as font:
        report['files']['Mono.ttf'] = {'sha256': hashlib.sha256((CACHE/'Mono.ttf').read_bytes()).hexdigest(), **glyph_report(font)}
    shutil.copyfile(LICENSE_SOURCE, CACHE/'Timeless-LICENSE.txt')
    shutil.copyfile(LICENSE_SOURCE, OUTPUT/'Timeless-LICENSE.txt')
    (CACHE/'font-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--font-dir', type=Path, help='Directory of official variable WOFF2 files with manifest filenames; hashes remain mandatory. No download when supplied.')
    args = parser.parse_args()
    print(json.dumps(prepare(args.font_dir), ensure_ascii=False, indent=2))
