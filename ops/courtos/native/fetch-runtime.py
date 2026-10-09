#!/usr/bin/env python3
"""Download pinned public artifacts. Never runs installers or reads credentials."""
import argparse, hashlib, json, os, pathlib, subprocess, tempfile, urllib.request
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('runtime_dir',type=pathlib.Path)
p.add_argument('--model-file',type=pathlib.Path,help='Opt in to the separate 6.72 GB model download; review model terms first.')
a=p.parse_args(); pins=json.loads(pathlib.Path(__file__).with_name('provenance.json').read_text())
a.runtime_dir.mkdir(parents=True,exist_ok=True)
def download(spec,target):
 if target.exists():
  with target.open('rb') as f: digest=hashlib.file_digest(f,'sha256').hexdigest()
  if digest==spec['sha256']:return
  raise SystemExit('Existing artifact checksum differs; refusing overwrite: '+str(target))
 target.parent.mkdir(parents=True,exist_ok=True)
 fd,tmp=tempfile.mkstemp(prefix='.download-',dir=target.parent)
 try:
  with os.fdopen(fd,'wb') as out, urllib.request.urlopen(spec['url'],timeout=60) as response:
   h=hashlib.sha256()
   while block:=response.read(1024*1024):out.write(block);h.update(block)
  if h.hexdigest()!=spec['sha256']:raise ValueError('Downloaded artifact checksum mismatch')
  os.chmod(tmp,0o644);os.replace(tmp,target)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)
for name in ['node','docker','llama_cpp']:
 spec=pins[name]; archive=a.runtime_dir/spec['url'].rsplit('/',1)[-1]
 download(spec,archive)
 subprocess.run(['tar','-xf',str(archive),'-C',str(a.runtime_dir)],check=True)
 print(name+' downloaded, verified and extracted')
if a.model_file:download(pins['model'],a.model_file);print('Model downloaded and verified')
