#!/usr/bin/env python3
"""Exercise Knowledge07 against a new disposable local PostgreSQL cluster.
No TCP listener, production database, application credentials or model calls.
Requires Homebrew initdb/pg_ctl/psql. Always removes its own temporary cluster.
"""
import json, os, pathlib, shutil, subprocess, tempfile, uuid
root=pathlib.Path(tempfile.mkdtemp(prefix='courtos-knowledge-test-'))
bin=pathlib.Path('/opt/homebrew/bin'); port='55441'; socket=root/'socket';socket.mkdir()
env={**os.environ,'PGHOST':str(socket),'PGPORT':port,'PGUSER':os.environ.get('USER','jonashertner'),'PGDATABASE':'postgres'}
checks=[]
def run(args,**kw):return subprocess.run(args,check=True,text=True,capture_output=True,timeout=90,env=env,**kw)
def sql(statement,role=None,check=True):
 p=subprocess.run([str(bin/'psql'),'-XAt','-v','ON_ERROR_STOP=1'],input=(('set role '+role+';\n') if role else '')+statement,text=True,capture_output=True,timeout=30,env=env)
 if check and p.returncode:raise RuntimeError(p.stderr)
 return p.stdout.strip().splitlines()[-1] if check and p.stdout.strip() else ('' if check else p)
def uid():return str(uuid.uuid4())
started=False
try:
 run([str(bin/'initdb'),'-D',str(root/'db'),'-A','trust','--no-locale','--encoding=UTF8'])
 run([str(bin/'pg_ctl'),'-D',str(root/'db'),'-l',str(root/'server.log'),'-o',f"-k {socket} -p {port} -c listen_addresses=''",'-w','start']);started=True
 sql('''create role anon;create role authenticated;create role service_role bypassrls;
 alter default privileges grant all on tables to service_role;
 create table documents(id uuid primary key,user_id uuid,project_id uuid,org_id uuid,workflow_id uuid,library_kind text,status text,current_version_id uuid);
 create table document_versions(id uuid primary key,document_id uuid references documents(id) on delete cascade,storage_path text,pdf_storage_path text,content_sha256 text,deleted_at timestamptz,version_number integer,filename text);
 ''')
 migration=pathlib.Path(__file__).resolve().parents[1]/'migrations/20261009_07_courtos_knowledge.sql'
 sql(migration.read_text());sql(migration.read_text());checks.append('Migration executable and idempotent with derived index on existing versions')
 a,b=uid(),uid(); da,db,va,vb=uid(),uid(),uid(),uid()
 sql(f"insert into documents values('{da}','{a}',null,null,null,'file','ready','{va}'),('{db}','{b}',null,null,null,'file','ready','{vb}');insert into document_versions values('{va}','{da}','a.pdf',null,'hash-a',null,1,'A.pdf',null),('{vb}','{db}','b.pdf',null,'hash-b',null,1,'SECRET-FILENAME.pdf',null);")
 def store(user,doc,version,quote,path='a.pdf',hash='hash-a',page=2):
  passages=json.dumps([{'page':page,'quote':quote}]).replace("'","''")
  return json.loads(sql(f"select courtos_store_knowledge_index('{user}','{doc}','{version}','{path}',null,'{hash}','{{\"index_status\":\"ready\",\"indexed_pages\":2,\"total_pages\":2}}','{passages}');",'service_role'))
 def search(user,ids,query):
  q=query.replace("'","''");arr=','.join("'"+x+"'" for x in ids)
  return json.loads(sql(f"select coalesce(json_agg(t),'[]') from courtos_search_knowledge('{user}',array[{arr}]::uuid[],'{q}',20) t;",'service_role'))
 assert store(a,da,va,'Das rechtliche Gehoer verlangt Gelegenheit zur Stellungnahme.')['stored']
 assert store(b,db,vb,'Gehoer SECRET-CANARY','b.pdf','hash-b')['stored']
 hits=search(a,[da,db],'Gehoer');assert len(hits)==1 and hits[0]['document_id']==da and hits[0]['version_id']==va and hits[0]['page']==2
 assert 'SECRET' not in json.dumps(hits);assert search(a,[db],'SECRET')==[];assert search(b,[db],'SECRET')
 checks.append('Service role can index/search; ownership and explicit selection exclude foreign filename, quote and ranking results')
 assert store(a,db,vb,'stolen','b.pdf','hash-b')['stored'] is False
 assert store(a,da,va,'stale',hash='old-hash')['stored'] is False
 checks.append('Foreign indexing and stale content fingerprints rejected')
 sql(f"update document_versions set content_sha256='hash-new' where id='{va}';")
 assert search(a,[da],'Gehoer')==[];assert sql(f"select count(*) from courtos_knowledge_passages where version_id='{va}';")=='0'
 checks.append('In-place content replacement deletes derived passages and invalidates metadata')
 assert store(a,da,va,'Neuer Wortlaut',hash='hash-new')['stored']
 sql(f"update documents set project_id='{uid()}' where id='{da}';")
 assert search(a,[da],'Wortlaut')==[]
 sql(f"update documents set project_id=null where id='{da}';update document_versions set deleted_at=now() where id='{va}';")
 assert search(a,[da],'Wortlaut')==[];assert sql(f"select count(*) from courtos_knowledge_passages where version_id='{va}';")=='0'
 checks.append('Moving out of personal library or soft deletion prevents retrieval; soft deletion purges passages')
 # Derived budget test: own fixtures alone exceed the private byte budget.
 sql(f"insert into courtos_knowledge_passages(version_id,ordinal,page,quote) select '{vb}',g,1,repeat('x',1600) from generate_series(1,5300) g;")
 dc,vc=uid(),uid();sql(f"insert into documents values('{dc}','{b}',null,null,null,'file','ready','{vc}');insert into document_versions values('{vc}','{dc}','c.pdf',null,'hash-c',null,1,'C.pdf',null);")
 budget=store(b,dc,vc,'Gehoer','c.pdf','hash-c');assert budget['metadata']['reason']=='index_budget' and budget['metadata']['index_status']=='unreadable'
 assert search(b,[dc],'Gehoer')==[]
 checks.append('Derived account byte budget persists a non-searchable state without storing more passage text')
 for role in ['anon','authenticated']:
  result=sql(f"select * from courtos_search_knowledge('{a}',array['{da}']::uuid[],'Gehoer',5);",role,False)
  assert result.returncode and 'permission denied' in result.stderr
  result=sql('select * from courtos_knowledge_passages;',role,False);assert result.returncode
 checks.append('Anonymous/authenticated roles cannot call index/search RPCs or read passage rows')
 for privilege in ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:
  assert sql("select has_table_privilege('service_role','courtos_knowledge_passages','"+privilege+"');")=='f'
 assert sql("select has_table_privilege('service_role','courtos_knowledge_passages','SELECT');")=='t'
 checks.append('Broad inherited Supabase-style service grants removed; direct writes denied while bounded definer RPC works')
 # Native ledger 08 hardening keeps only owner-run reservation/release RPCs.
 sql((migration.parent/'20261009_04_courtos_native_quota.sql').read_text())
 sql((migration.parent/'20261009_08_courtos_native_ledger_grants.sql').read_text())
 sql((migration.parent/'20261009_08_courtos_native_ledger_grants.sql').read_text())
 attempt=uid()
 assert json.loads(sql(f"select courtos_reserve_native_start('{a}','{attempt}');",'service_role'))['allowed']
 sql(f"select courtos_release_native_start('{a}','{attempt}',true);",'service_role')
 assert sql(f"select released_at is not null and counted from courtos_native_starts where id='{attempt}';",'service_role')=='t'
 for statement in ['delete from courtos_native_starts;', 'truncate courtos_native_starts;', 'update courtos_native_starts set counted=false;']:
  denied=sql(statement,'service_role',False);assert denied.returncode and 'permission denied' in denied.stderr
 checks.append('Native 08 reserve/release RPCs work as service_role; direct DELETE/TRUNCATE/UPDATE denied despite broad defaults')
 print(json.dumps({'passed':True,'checks':checks,'scope':'Disposable local Unix-socket PostgreSQL; no application/VPS data; cluster removed on exit'},indent=2))
finally:
 if started:subprocess.run([str(bin/'pg_ctl'),'-D',str(root/'db'),'-m','immediate','-w','stop'],capture_output=True,timeout=30)
 shutil.rmtree(root)
