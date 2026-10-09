#!/usr/bin/env python3
"""Install reviewed, rendered files as root; never starts or restarts services."""
import argparse, grp, json, os, pathlib, pwd, shutil, socket, subprocess
p=argparse.ArgumentParser(description=__doc__);p.add_argument('rendered_dir',type=pathlib.Path);a=p.parse_args()
if os.geteuid()!=0:raise SystemExit('Root required')
c=json.loads((a.rendered_dir/'private/operator.json').read_text())
from configure import validate
validate(c)
prefix=c['service_prefix'];cfg=pathlib.Path(c['config_dir']);state=pathlib.Path(c['state_dir']);release=pathlib.Path(c['release_dir'])
if cfg.exists():raise SystemExit('Configuration destination exists; refusing overwrite. Review updates manually.')
if state.exists():raise SystemExit('State destination exists; refusing a fresh install. Review updates manually.')
for sub in ['files','hybrid','gateway','postgres','docker']:
 if (state/sub).exists():raise SystemExit('State already exists; refusing fresh install: '+sub)
for unit in (a.rendered_dir/'units').glob('*'):
 if (pathlib.Path('/etc/systemd/system')/unit.name).exists():raise SystemExit('Unit exists; refusing overwrite: '+unit.name)
for suffix in ['', '-web', '-proxy', '-app', '-gate', '-model']:
 try:pwd.getpwnam(prefix+suffix)
 except KeyError:pass
 else:raise SystemExit('Service identity already exists; choose a fresh prefix: '+prefix+suffix)
try:grp.getgrnam(prefix+'-packet')
except KeyError:pass
else:raise SystemExit('Packet group already exists; choose a fresh prefix')
for port in [18180,18181,18182,18189,18190,18191,18192,18193,18194,18195]:
 with socket.socket() as probe:
  try:probe.bind(('127.0.0.1',port))
  except OSError:raise SystemExit('Port already in use; refusing fresh install: '+str(port))
for file in ['backend/dist/app.js','frontend/.next/BUILD_ID','hybrid/.venv/bin/uvicorn']:
 if not (release/file).is_file():raise SystemExit('Build the selected release first: '+file)
for suffix in ['', '-web', '-proxy', '-app', '-gate', '-model']:
 name=prefix+suffix
 try:pwd.getpwnam(name)
 except KeyError:subprocess.run(['useradd','--system','--user-group','--home-dir','/nonexistent','--shell','/usr/sbin/nologin',name],check=True)
shared=prefix+'-packet'
try:grp.getgrnam(shared)
except KeyError:subprocess.run(['groupadd','--system',shared],check=True)
for suffix in ['-app','-gate']:subprocess.run(['usermod','-a','-G',shared,prefix+suffix],check=True)
shutil.copytree(a.rendered_dir,cfg)
os.chmod(cfg,0o755)
for parent,mode in [('private',0o700),('shared',0o750),('public',0o755),('units',0o755)]:os.chmod(cfg/parent,mode)
os.chown(cfg/'shared',0,grp.getgrnam(shared).gr_gid)
os.chown(cfg/'shared/packet-hmac',0,grp.getgrnam(shared).gr_gid)
# All configuration is root-owned. Service managers read EnvironmentFiles
# before applying per-service user and filesystem restrictions.
for root,dirs,files in os.walk(cfg):
 for name in files:os.chown(pathlib.Path(root)/name,0,grp.getgrnam(shared).gr_gid if name=='packet-hmac' else 0)
state.mkdir(mode=0o755,parents=True,exist_ok=True);os.chmod(state,0o755)
for sub,user in [('files',prefix),('hybrid',prefix+'-app'),('gateway',prefix+'-gate'),('postgres','root'),('docker','root')]:
 folder=state/sub
 if folder.exists():raise SystemExit('State already exists; refuse a fresh install into '+str(folder))
 folder.mkdir(mode=0o700);u=pwd.getpwnam(user);os.chown(folder,u.pw_uid,u.pw_gid)
# The external gateway cannot read the fictional local case source, even
# before systemd's namespace deny rule is applied.
case=release/'hybrid/data/demo.json';os.chown(case,0,pwd.getpwnam(prefix+'-app').pw_gid);os.chmod(case,0o640)
for unit in (cfg/'units').glob('*'):
 dest=pathlib.Path('/etc/systemd/system')/unit.name
 if dest.exists():raise SystemExit('Unit exists; refusing overwrite: '+unit.name)
 shutil.copyfile(unit,dest);os.chmod(dest,0o644)
subprocess.run(['systemctl','daemon-reload'],check=True)
print('Installed configuration and units. No service was started; follow the reviewed start order in README.md.')
