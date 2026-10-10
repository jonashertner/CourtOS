#!/usr/bin/env python3
"""Actual PostgreSQL owner/CAS/expiry tests in a disposable Unix-socket cluster.
No TCP listener, application credentials, production data, files or model calls.
"""
import concurrent.futures, json, os, pathlib, select, shutil, subprocess, tempfile, time, uuid

root = pathlib.Path(tempfile.mkdtemp(prefix='courtos-handoff-test-'))
pgbin = pathlib.Path('/opt/homebrew/bin')
socket = root / 'socket'
socket.mkdir()
env = {**os.environ, 'PGHOST': str(socket), 'PGPORT': '55443', 'PGUSER': os.environ.get('USER', 'jonashertner'), 'PGDATABASE': 'postgres'}
checks = []
started = False

def run(args):
    return subprocess.run(args, check=True, text=True, capture_output=True, timeout=90, env=env)

def sql(statement, role=None, check=True):
    result = subprocess.run([str(pgbin/'psql'), '-XAt', '-v', 'ON_ERROR_STOP=1'], input=(f'set role {role};\n' if role else '')+statement, text=True, capture_output=True, timeout=30, env=env)
    if not check:
        return result
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip().splitlines()[-1] if result.stdout.strip() else ''

def uid(): return str(uuid.uuid4())
def literal(value): return 'null' if value is None else "'"+str(value).replace("'", "''")+"'"

def state():
    return {'version': 1, 'mode': 'public', 'public': {'query': 'rechtliches Gehör', 'submitted': '', 'language': '', 'result': None, 'source': None}, 'private': {'query': '', 'submitted': '', 'selected': [], 'result': None, 'source': None}}

def rpc(owner, action, handle=None, expected=None, value=None, direction=None, metadata=False, role='service_role'):
    args = [literal(owner), literal(action), literal(handle), str(expected) if expected is not None else 'null', literal(json.dumps(value, ensure_ascii=False)) if value is not None else 'null', literal(direction), str(metadata).lower()]
    return json.loads(sql('select public.courtos_research_handoff('+','.join(args)+');', role))

try:
    run([str(pgbin/'initdb'), '-D', str(root/'db'), '-A', 'trust', '--no-locale', '--encoding=UTF8'])
    run([str(pgbin/'pg_ctl'), '-D', str(root/'db'), '-l', str(root/'server.log'), '-o', f"-k {socket} -p 55443 -c listen_addresses=''", '-w', 'start'])
    started = True
    sql('''create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges grant all on tables to service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create table documents(id uuid primary key,user_id uuid,project_id uuid,org_id uuid,workflow_id uuid,library_kind text,status text,current_version_id uuid);
      create table document_versions(id uuid primary key,document_id uuid references documents(id) on delete cascade,deleted_at timestamptz,filename text,version_number integer,courtos_knowledge_index jsonb,storage_path text,pdf_storage_path text,content_sha256 text);
    ''')
    migration = pathlib.Path(__file__).resolve().parents[1] / 'migrations/20261010_01_courtos_research_handoffs.sql'
    sql((migration.parent/'20261009_07_courtos_knowledge.sql').read_text())
    sql(migration.read_text()); sql(migration.read_text())
    checks.append('Migration executes twice without destructive changes')
    a,b,c=uid(),uid(),uid()
    sql(f"insert into auth.users values('{a}'),('{b}'),('{c}');")
    created=rpc(a,'create',value=state())
    assert created['status']=='ok'
    h=created['record']['id']; initial=created['record']
    assert initial['revision']==1 and initial['acknowledged_revision']==0 and initial['direction']=='to_browser' and 'state' not in initial
    assert rpc(a,'read',h)['record']['state']==state()
    assert 'state' not in rpc(a,'read',h,metadata=True)['record']
    assert rpc(b,'read',h)=={'status':'not_found'}
    assert rpc(b,'update',h,1,state(),'to_word')=={'status':'not_found'}
    assert rpc(b,'ack',h,1)=={'status':'not_found'}
    checks.append('Only owner can read/update/ack; metadata responses contain no payload')

    def update(i):
        value=state();value['public']['query']=f'Change {i}'
        return rpc(a,'update',h,1,value,'to_word')
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(update,[1,2]))
    assert sorted(r['status'] for r in results)==['conflict','ok']
    latest=rpc(a,'read',h)['record'];assert latest['revision']==2 and latest['expires_at']==initial['expires_at']
    assert rpc(a,'ack',h,1)=={'status':'conflict'}
    ack=rpc(a,'ack',h,2);assert ack['record']['acknowledged_revision']==2
    assert rpc(a,'ack',h,2)==ack
    checks.append('Concurrent writers: exactly one CAS succeeds; old ACK conflicts; latest ACK idempotent; TTL not extended')

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(lambda _:rpc(b,'create',value=state()),range(8)))
    assert sum(r['status']=='ok' for r in results)==4 and sum(r['status']=='limit' for r in results)==4
    assert sql(f"select count(*) from courtos_research_handoffs where user_id='{b}';")=='4'
    checks.append('Eight simultaneous creates cannot exceed four active owner records')

    for revision in range(2,32): assert rpc(a,'update',h,revision,state(),'to_browser')['status']=='ok'
    assert rpc(a,'update',h,32,state(),'to_word')=={'status':'revision_limit'}
    assert rpc(a,'read',h)['record']['revision']==32
    assert rpc(a,'ack',h,32)['record']['acknowledged_revision']==32
    checks.append('Bounded32 revisions; final revision remains readable and acknowledgeable')

    sql(f"update courtos_research_handoffs set created_at=now()-interval '3 hours',expires_at=now()-interval '1 hour' where id='{h}';")
    assert rpc(a,'read',h)=={'status':'not_found'}
    assert sql(f"select count(*) from courtos_research_handoffs where id='{h}';")=='0'
    checks.append('Expired handle returns indistinguishable404 status and payload is purged on owner access')

    da,db,va,vb,old=uid(),uid(),uid(),uid(),uid()
    sql(f"insert into documents values('{da}','{c}',null,null,null,'file','ready','{va}'),('{db}','{b}',null,null,null,'file','ready','{vb}'); insert into document_versions(id,document_id,deleted_at,filename,version_number,courtos_knowledge_index) values('{va}','{da}',null,'Synthetic.pdf',2,'{{}}'),('{old}','{da}',null,'Old.pdf',1,'{{}}'),('{vb}','{db}',null,'Foreign.pdf',1,'{{}}'); insert into courtos_knowledge_passages(version_id,ordinal,page,quote) values('{old}',0,1,'Synthetic quote');")
    private=state();private['mode']='private';private['private']['selected']=[{'id':da,'filename':'Synthetic.pdf','file_type':'pdf','active_version_id':va,'active_version_number':2,'size_bytes':100}]
    private['private']['source']={'document_id':da,'version_id':old,'version_number':1,'filename':'Old.pdf','page':1,'quote':'Synthetic quote','score':1}
    ph=rpc(c,'create',value=private)['record']['id']
    assert rpc(c,'read',ph)['status']=='ok'
    checks.append('Selected current version and older live owned source version both authorised')
    for field,value in [('quote','Forged quote'),('page',2),('filename','Forged.pdf'),('version_number',2)]:
        forged=json.loads(json.dumps(private));forged['private']['source'][field]=value
        assert rpc(c,'create',value=forged)=={'status':'not_found'}
        assert rpc(c,'update',ph,1,forged,'to_word')=={'status':'not_found'}
    sql(f"update courtos_knowledge_passages set quote='Changed text' where version_id='{old}';")
    assert rpc(c,'read',ph)=={'status':'not_found'}
    sql(f"update courtos_knowledge_passages set quote='Synthetic quote' where version_id='{old}'; update document_versions set courtos_knowledge_index=null where id='{old}';")
    assert rpc(c,'read',ph)=={'status':'not_found'}
    sql(f"update document_versions set courtos_knowledge_index='{{}}' where id='{old}';")
    assert rpc(c,'read',ph)['status']=='ok'
    checks.append('Exact indexed page/quote and authoritative filename/version required; forged or stale index cannot restore')
    sql(f"update document_versions set content_sha256='changed-bytes' where id='{old}';")
    assert sql(f"select count(*) from courtos_knowledge_passages where version_id='{old}';")=='0'
    assert rpc(c,'read',ph)=={'status':'not_found'}
    sql(f"update document_versions set courtos_knowledge_index='{{}}' where id='{old}'; insert into courtos_knowledge_passages(version_id,ordinal,page,quote) values('{old}',0,1,'Synthetic quote');")
    checks.append('Actual shipped content-hash invalidation trigger deletes passage rows and invalidates restored quotes')
    stolen=state();stolen['private']['source']={'document_id':db,'version_id':vb,'version_number':1,'filename':'Foreign.pdf','page':1,'quote':'CANARY','score':1}
    assert rpc(c,'create',value=stolen)=={'status':'not_found'}
    assert rpc(c,'update',ph,1,stolen,'to_word')=={'status':'not_found'}
    stolen['private']['source']['document_id']=da
    assert rpc(c,'create',value=stolen)=={'status':'not_found'}
    checks.append('Foreign document or mismatched document/version rejected before persistence')
    sql(f"update document_versions set deleted_at=now() where id='{old}';")
    assert rpc(c,'read',ph)=={'status':'not_found'}
    assert rpc(c,'read',ph,metadata=True)=={'status':'not_found'}
    assert rpc(c,'ack',ph,1)=={'status':'not_found'}
    sql(f"update document_versions set deleted_at=null where id='{old}'; update documents set current_version_id='{old}' where id='{da}';")
    assert rpc(c,'read',ph)=={'status':'not_found'}
    sql(f"update documents set current_version_id='{va}',project_id='{uid()}' where id='{da}';")
    assert rpc(c,'read',ph)=={'status':'not_found'}
    checks.append('Deletion, active-version replacement and move outside personal library invalidate reads/metadata/ACK')

    oversized=state();oversized['public']['query']='x'*65536
    assert rpc(c,'create',value=oversized)=={'status':'invalid'}
    for role in ['anon','authenticated','service_role']:
        assert sql('select * from courtos_research_handoffs;',role,False).returncode
        assert sql('delete from courtos_research_handoffs;',role,False).returncode
    for role in ['anon','authenticated']:
        assert sql(f"select courtos_research_handoff('{a}','read','{h}');",role,False).returncode
    for privilege in ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:
        assert sql(f"select has_table_privilege('service_role','courtos_research_handoffs','{privilege}');")=='f'
    checks.append('64KiB SQL cap; broad default grants revoked; only bounded RPC available to service role')
    sql(f"delete from auth.users where id='{b}';")
    assert sql(f"select count(*) from courtos_research_handoffs where user_id='{b}';")=='0'
    checks.append('Account deletion cascades temporary payloads')
    d,e=uid(),uid();sql(f"insert into auth.users values('{d}'),('{e}');")
    value=literal(json.dumps(state()))
    sql(f"insert into courtos_research_handoffs(user_id,state) select '{a}',{value}::jsonb from generate_series(1,511-(select count(*)::integer from courtos_research_handoffs));")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(lambda owner:rpc(owner,'create',value=state()),[d,e]))
    assert sorted(r['status'] for r in results)==['limit','ok']
    assert sql('select count(*) from courtos_research_handoffs;')=='512'
    sql(f"update courtos_research_handoffs set created_at=now()-interval '3 hours',expires_at=now()-interval '1 hour' where user_id='{a}';")
    assert rpc(d,'create',value=state())['status']=='ok'
    assert int(sql('select count(*) from courtos_research_handoffs;'))<512
    checks.append('Global512 admission cap is atomic across owners; create purges expired drafts across owners without a periodic job')
    # Deterministic former deadlock: reader holds owner lock; creator must wait
    # BEFORE locking/pruning the expired row that the reader will next inspect.
    f,expired=uid(),uid();sql(f"insert into auth.users values('{f}'); insert into courtos_research_handoffs(id,user_id,state,created_at,expires_at) values('{expired}','{f}',{value}::jsonb,now()-interval '3 hours',now()-interval '1 hour');")
    reader=subprocess.Popen([str(pgbin/'psql'),'-XqAt','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
    try:
        reader.stdin.write(f"begin; select pg_advisory_xact_lock(hashtextextended('courtos-handoff:{f}',0)); select 'OWNER_LOCKED';\n");reader.stdin.flush()
        deadline=time.monotonic()+5; output=b''
        while b'OWNER_LOCKED' not in output:
            assert time.monotonic()<deadline, 'Reader did not acquire owner lock'
            if select.select([reader.stdout],[],[],0.1)[0]: output+=os.read(reader.stdout.fileno(),4096)
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future=pool.submit(sql,f"set application_name='courtos-handoff-create-race'; select courtos_research_handoff('{f}','create',null,null,{value}::jsonb);",'service_role')
            deadline=time.monotonic()+5
            while sql("select count(*) from pg_stat_activity where application_name='courtos-handoff-create-race' and wait_event='advisory';")!='1':
                assert time.monotonic()<deadline, 'Creator did not reach owner admission lock'
                time.sleep(0.025)
            out,err=reader.communicate(f"set local role service_role; select courtos_research_handoff('{f}','read','{expired}'); commit;\n",timeout=10)
            assert reader.returncode==0,err
            assert 'not_found' in out
            assert json.loads(future.result(timeout=10))['status']=='ok'
    finally:
        if reader.poll() is None: reader.kill();reader.communicate(timeout=5)
    checks.append('Deterministic owner-lock/expired-row create-read interleaving completes without deadlock')
    print(json.dumps({'passed':True,'checks':checks,'scope':'Disposable local PostgreSQL via private Unix socket, no external calls; cluster removed on exit'},indent=2))
finally:
    if started: subprocess.run([str(pgbin/'pg_ctl'),'-D',str(root/'db'),'-m','immediate','-w','stop'],capture_output=True,timeout=30)
    shutil.rmtree(root)
