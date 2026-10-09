#!/usr/bin/env python3
"""Explicit fresh CourtOS data-service startup/schema bootstrap. Never upgrade in place."""
import argparse, json, os, pathlib, subprocess, time, urllib.request
p=argparse.ArgumentParser(description=__doc__);p.add_argument('config_dir',type=pathlib.Path);p.add_argument('command',choices=['start','init-new-database']);a=p.parse_args()
if os.geteuid()!=0:raise SystemExit('Root required')
c=json.loads((a.config_dir/'private/operator.json').read_text());prefix=c['service_prefix'];state=pathlib.Path(c['state_dir']);release=pathlib.Path(c['release_dir'])
from configure import validate
validate(c)
pins=json.loads(pathlib.Path(__file__).with_name('provenance.json').read_text())['containers']
docker=[c['runtime_dir']+'/docker/docker','-H','unix:///run/'+prefix+'-docker.sock']
def run(args,**kw):return subprocess.run(docker+args,check=True,**kw)
def env(name):return str(a.config_dir/'private'/name)
def wait_auth():
 for _ in range(60):
  try:
   with urllib.request.urlopen('http://127.0.0.1:18193/health',timeout=2) as response:
    if response.status==200:return
  except Exception:pass
  time.sleep(1)
 raise SystemExit('GoTrue not healthy; schema was not applied')
if a.command=='start':
 for role in ['db','auth','rest']:
  if subprocess.run(docker+['container','inspect',prefix+'-'+role],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:
   raise SystemExit('Container exists; refusing fresh startup: '+role)
 for image in pins.values():run(['pull',image],stdout=subprocess.DEVNULL)
 common=['--network','host','--restart','unless-stopped','--log-driver','local','--log-opt','max-size=10m','--log-opt','max-file=2']
 run(['run','-d','--name',prefix+'-db',*common,'--memory','2g','--cpus','2','--env-file',env('db.env'),'-v',str(state/'postgres')+':/var/lib/postgresql/data','-v',env('roles.sql')+':/docker-entrypoint-initdb.d/zz-courtos-roles.sql:ro',pins['postgres'],'postgres','-c','listen_addresses=127.0.0.1','-c','port=18195'],stdout=subprocess.DEVNULL)
 for _ in range(60):
  if subprocess.run(docker+['exec',prefix+'-db','pg_isready','-h','127.0.0.1','-p','18195'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
  time.sleep(1)
 else:raise SystemExit('Database not ready')
 run(['run','-d','--name',prefix+'-auth',*common,'--memory','256m','--cpus','1','--env-file',env('auth.env'),pins['auth']],stdout=subprocess.DEVNULL)
 run(['run','-d','--name',prefix+'-rest',*common,'--memory','256m','--cpus','1','--env-file',env('rest.env'),pins['rest']],stdout=subprocess.DEVNULL)
 wait_auth();print('Dedicated data services started; apply the fresh schema explicitly next.')
else:
 wait_auth()
 psql=['exec','-i',prefix+'-db','psql','-h','127.0.0.1','-p','18195','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
 existing=run(psql+['-Atc',"select to_regclass('public.projects') is not null"],capture_output=True,text=True).stdout.strip()
 if existing!='f':raise SystemExit('Existing or unknown schema; refusing fresh schema application. Use the migration ledger for upgrades.')
 for source in [release/'backend/schema.sql',release/'ops/courtos/seed-workflows.sql']:
  with source.open('rb') as content:run(psql,stdin=content,stdout=subprocess.DEVNULL)
 run(psql+['-c',"NOTIFY pgrst, 'reload schema'"],stdout=subprocess.DEVNULL)
 print('Fresh schema and initial court workflows installed.')
