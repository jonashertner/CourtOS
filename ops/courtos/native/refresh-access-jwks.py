#!/usr/bin/python3
"""Refresh pinned Access public keys; retain old keys on fetch/validation failure."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import ssl
import stat
import sys
import tempfile
import urllib.request

import argparse
from urllib.parse import urlsplit
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--issuer', required=True)
parser.add_argument('--destination', type=Path, required=True)
args = parser.parse_args()
origin = urlsplit(args.issuer)
if origin.scheme != 'https' or not origin.hostname or origin.username or origin.password or origin.query or origin.fragment or origin.path not in ('', '/'):
    parser.error('issuer must be an HTTPS origin')
SOURCE = args.issuer.rstrip('/') + '/cdn-cgi/access/certs'
DESTINATION = args.destination
MAX_BYTES = 262144


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Redirect refused for pinned JWKS source')


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate JSON member')
        result[key] = value
    return result


def positive_integer(value):
    if not isinstance(value, str) or not value or len(value) > 1400 or not re.fullmatch(r'[A-Za-z0-9_-]+', value):
        raise ValueError('Invalid RSA base64url integer')
    raw = base64.b64decode(value + '=' * (-len(value) % 4), altchars=b'-_', validate=True)
    if not raw or raw[0] == 0:
        raise ValueError('Invalid RSA integer encoding')
    if base64.urlsafe_b64encode(raw).decode().rstrip('=') != value:
        raise ValueError('Non-canonical RSA integer encoding')
    return int.from_bytes(raw, 'big')


def validated_keys(raw):
    data = json.loads(raw.decode('utf-8'), object_pairs_hook=unique_object)
    if not isinstance(data, dict) or not isinstance(data.get('keys'), list) or not 1 <= len(data['keys']) <= 16:
        raise ValueError('Invalid JWKS collection')
    seen, keys = set(), []
    for key in data['keys']:
        if not isinstance(key, dict) or key.get('kty') != 'RSA' or key.get('alg') != 'RS256' or key.get('use') != 'sig':
            raise ValueError('Only RSA/RS256 signature keys are accepted')
        if any(name in key for name in ('d', 'p', 'q', 'dp', 'dq', 'qi', 'oth')):
            raise ValueError('Private key material refused')
        kid = key.get('kid')
        if not isinstance(kid, str) or not 1 <= len(kid) <= 256 or any(ord(c) < 33 or ord(c) > 126 for c in kid) or kid in seen:
            raise ValueError('Invalid or duplicate key identifier')
        modulus, exponent = positive_integer(key.get('n')), positive_integer(key.get('e'))
        if not 2048 <= modulus.bit_length() <= 8192 or modulus % 2 != 1 or not 3 <= exponent <= 2**32 - 1 or exponent % 2 != 1 or exponent >= modulus:
            raise ValueError('Invalid RSA public numbers')
        seen.add(kid)
        keys.append({name: key[name] for name in ('kid', 'kty', 'alg', 'use', 'e', 'n')})
    return {'keys': keys}


def main():
    if os.geteuid() != 0:
        raise ValueError('Root execution required for public-key file ownership')
    directory = DESTINATION.parent
    info = directory.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('Destination directory must be root-owned and not group/world writable')
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(), urllib.request.HTTPSHandler(context=context))
    request = urllib.request.Request(SOURCE, headers={'Accept': 'application/json', 'User-Agent': 'CourtOS-JWKS/1.0'})
    with opener.open(request, timeout=20) as response:
        if response.status != 200 or response.url != SOURCE:
            raise ValueError('Unexpected JWKS origin or response status')
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('JWKS response too large')
    data = validated_keys(raw)
    payload = (json.dumps(data, sort_keys=True, separators=(',', ':')) + '\n').encode()
    descriptor, temporary = tempfile.mkstemp(prefix='.access-jwks-', dir=directory)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(payload)
            output.flush()
            os.fchmod(output.fileno(), 0o644)
            os.fsync(output.fileno())
        os.replace(temporary, DESTINATION)
        directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('JWKS refresh succeeded: {} validated RSA keys; sha256={}'.format(len(data['keys']), hashlib.sha256(payload).hexdigest()))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('JWKS refresh failed; no unvalidated key data installed: {}: {}'.format(type(exc).__name__, exc), file=sys.stderr)
        raise SystemExit(1)
