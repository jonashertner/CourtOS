#!/usr/bin/env python3
"""Fetch the separately licensed, unmodified Timeless embedding assets.

Read https://www.timeless.co/type/license before using --accept-license.
The destination is gitignored. No credentials or third-party font CDN are used.
"""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
DEST = HERE.parent / 'public/fonts/timeless'
MAX_BYTES = 2 * 1024 * 1024


class LicenseText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hidden = 0
        self.parts = []
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.hidden += 1
        if tag in ('p', 'h1', 'h2', 'h3', 'li', 'br'): self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.hidden = max(0, self.hidden - 1)
    def handle_data(self, data):
        if not self.hidden: self.parts.append(data)


def download(url):
    if urlsplit(url).scheme != 'https' or urlsplit(url).netloc != 'www.timeless.co':
        raise ValueError('Only the official HTTPS publisher host is permitted')
    request = Request(url, headers={'User-Agent': 'Mozilla/5.0 (CourtOS font embedding setup)'})
    with urlopen(request, timeout=30) as response:
        if urlsplit(response.url).netloc != 'www.timeless.co':
            raise ValueError('Publisher redirect left the official host')
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES: raise ValueError('Publisher response exceeds size limit')
    return data


def fetch():
    manifest = json.loads((HERE / 'timeless-fonts.json').read_text())
    # Capture the current licence for the operator/embedding collaborator, not Git.
    parser = LicenseText()
    parser.feed(download(manifest['license_url']).decode('utf-8'))
    licence = ''.join(parser.parts)
    if 'Timeless Free Font License' not in licence or '1.2' not in licence:
        raise ValueError('Expected licence v1.2 not found. Review the publisher terms before updating this script.')
    checked = []
    for record in manifest['files']:
        destination = DEST / record['file']
        data = destination.read_bytes() if destination.exists() else download(record['url'])
        if len(data) != record['bytes'] or hashlib.sha256(data).hexdigest() != record['sha256']:
            raise ValueError('Official font hash/length mismatch: ' + record['file'])
        checked.append((destination, data))
    DEST.mkdir(parents=True, exist_ok=True)
    for destination, data in checked: destination.write_bytes(data)
    (DEST / 'LICENSE.txt').write_text('Source: '+manifest['license_url']+'\n\n'+licence+'\n')
    print('Verified three unmodified Timeless web fonts; licence saved locally. Do not commit this directory.')


if __name__ == '__main__':
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--accept-license', action='store_true', help='Confirm that the operator has read and accepts the publisher licence for this work')
    options = args.parse_args()
    if not options.accept_license: args.error('Read the publisher licence and supply --accept-license to fetch embedding assets.')
    fetch()
