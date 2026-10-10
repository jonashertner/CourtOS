#!/usr/bin/env python3
"""Provision one pinned public Citecheck index. No document input or credentials."""
import argparse, gzip, hashlib, io, json, os, pathlib, tempfile, urllib.request

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    manifest_path = pathlib.Path(__file__).resolve().parents[1] / 'src/lib/citecheck/index-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    assert manifest['schema'] == 1 and 0 < manifest['bytes'] <= 32 * 1024 * 1024
    assert 0 < manifest['unpacked_bytes'] <= 128 * 1024 * 1024
    name = manifest['file']
    assert pathlib.Path(name).name == name and name.endswith('.tsv.gz')
    destination = args.output.resolve()
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / name
    if target.exists():
        data = target.read_bytes()
    else:
        url = 'https://jonashertner.github.io/citecheck/index/' + name
        request = urllib.request.Request(url, headers={'User-Agent': 'CourtOS-public-index-provisioner/1'})
        with urllib.request.urlopen(request, timeout=60) as response:
            assert response.geturl() == url and response.status == 200
            data = response.read(manifest['bytes'] + 1)
    assert len(data) == manifest['bytes']
    assert hashlib.sha256(data).hexdigest() == manifest['sha256']
    with gzip.GzipFile(fileobj=io.BytesIO(data)) as stream:
        text = stream.read(manifest['unpacked_bytes'] + 1)
    assert len(text) == manifest['unpacked_bytes'] and text.startswith(b'#ocl-cite-index 1')
    if not target.exists():
        with tempfile.NamedTemporaryFile(dir=destination, prefix='.citecheck-', delete=False) as file:
            temp = pathlib.Path(file.name)
            file.write(data); file.flush(); os.fsync(file.fileno())
        temp.chmod(0o644)
        try:
            # Hard link refuses a competing writer; never overwrite a cache file.
            os.link(temp, target)
        finally:
            temp.unlink()
    print(json.dumps({'file':str(target),'sha256':manifest['sha256'],'bytes':len(data),'unpacked_bytes':len(text),'generated':manifest['generated'],'runtime_network_required':False}))

if __name__ == '__main__':
    main()
