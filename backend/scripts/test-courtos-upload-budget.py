#!/usr/bin/env python3
"""Exercise actual upload SQL, including concurrent connections, in a throwaway DB.

Only a local Unix socket under a courtos-postgres-test-* directory is accepted.
Uses the original upload tables/RPC from the migration with a minimal auth.users
fixture, not a Supabase/network/storage integration. No model or storage calls.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import subprocess
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--socket', required=True)
parser.add_argument('--port', required=True, type=int)
parser.add_argument('--user', default=os.environ.get('USER', 'postgres'))
args = parser.parse_args()
path = Path(args.socket).resolve()
if not path.is_dir() or path.name != 'socket' or not path.parent.name.startswith('courtos-postgres-test-'):
    raise SystemExit('Only the disposable CourtOS test cluster is allowed')
common = ['-h', args.socket, '-p', str(args.port), '-U', args.user]
database = 'courtos_upload_test_' + uuid.uuid4().hex[:12]
checks = []

def command(argv, **kwargs):
    return subprocess.run(argv, text=True, capture_output=True, timeout=30, **kwargs)

def sql(statement, check=True):
    result = command(['psql', *common, '-d', database, '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', statement])
    if check and result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip() if check else result

def lit(value):
    return "'" + str(value).replace("'", "''") + "'"

def user():
    value = str(uuid.uuid4())
    sql(f"insert into auth.users(id,email) values('{value}','synthetic@example.test');")
    return value

def manifest(owner, session, sizes=(100,)):
    result = []
    for i, size in enumerate(sizes):
        fid = str(uuid.uuid4())
        base = f'upload-sessions/{owner}/{session}/{fid}'
        result.append(dict(id=fid, resource_id=str(uuid.uuid4()), client_id=f'file-{i}', filename='synthetic.pdf',
            target_folder_id=None, file_type='pdf', content_type='application/pdf', expected_size_bytes=size,
            staging_storage_path=base+'/staging', sealed_storage_path=base+'/sealed'))
    return result

def reserve(owner, session=None, files=None, user_limit=20971520, global_limit=524288000,
            file_limit=5242880, count_limit=5, rate=50, raw=False, prefix='', suffix=''):
    session = session or str(uuid.uuid4())
    files = files if files is not None else manifest(owner, session)
    query = f"select public.create_courtos_upload_session('{session}','{owner}','document_create'," + \
      "'{\"scope\":\"standalone\"}'::jsonb,now()+interval '30 minutes'," + lit(json.dumps(files)) + \
      f'::jsonb,{rate},{file_limit},{count_limit},{user_limit},{global_limit});'
    return sql(prefix + query + suffix, check=not raw)

def denied(result, message):
    assert result.returncode != 0 and message in result.stderr, (message, result.stdout, result.stderr)

def reset():
    sql('truncate public.upload_sessions cascade; truncate public.courtos_upload_reservations;')

created = command(['createdb', *common, database])
if created.returncode:
    raise SystemExit(created.stderr)
try:
    sql("do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select from pg_roles where rolname='service_role') then create role service_role; end if; end $$;")
    sql('alter default privileges in schema public grant all on tables to service_role;')
    sql('create schema auth; create table auth.users(id uuid primary key, email text);')
    migrations = Path(__file__).resolve().parents[1] / 'migrations'
    original = (migrations / '20260828_02_upload_sessions.sql').read_text()
    sql(original[original.index('create table if not exists public.upload_sessions ('):original.index('create table if not exists public.upload_processing_jobs (')])
    sql(original[original.index('create or replace function public.create_upload_session('):original.index('-- Extend a live session')])
    new_sql = (migrations / '20261009_05_courtos_upload_budget.sql').read_text()
    # An old failed upload is backfilled, and reruns never reset counters.
    old_user = user(); old_session = str(uuid.uuid4())
    sql(f"insert into public.upload_sessions(id,user_id,purpose,destination,expected_file_count,expected_total_bytes,status,expires_at) values('{old_session}','{old_user}','document_create','{{}}',1,100,'error',now());")
    grants_sql = (migrations / '20261009_06_courtos_upload_ledger_grants.sql').read_text()
    sql(new_sql); sql(new_sql); sql(grants_sql); sql(grants_sql)
    assert sql('select sum(reserved_bytes) from public.courtos_upload_reservations;') == '100'
    checks.append('migration runs twice and backfills failed historical sessions once')
    reset()

    owner = user(); session = str(uuid.uuid4()); files = manifest(owner, session, (100, 200))
    expiry = json.loads(reserve(owner, session, files))['expires_at']
    assert json.loads(reserve(owner, session, list(reversed(files))))['expires_at'] == expiry
    assert sql('select count(*)||\':\'||sum(reserved_bytes) from public.courtos_upload_reservations;') == '1:300'
    denied(reserve(user(), session, files, raw=True), 'courtos_upload_session_conflict')
    changed = [dict(f) for f in files]; changed[0]['filename'] = 'other.pdf'
    denied(reserve(owner, session, changed, raw=True), 'courtos_upload_session_conflict')
    checks.append('same session retry is idempotent and exact owner/manifest bound')

    sql(f"update public.upload_sessions set status='cancelled' where id='{session}';")
    denied(reserve(owner, session, files, raw=True), 'courtos_upload_session_closed')
    sql(f"delete from auth.users where id='{owner}';")
    assert sql('select sum(reserved_bytes) from public.courtos_upload_reservations;') == '300'
    assert sql('select count(*) from public.upload_sessions;') == '0'
    checks.append('cancellation and account/session cascade deletion do not refund reservations')
    reset()

    owner = user()
    for _ in range(4):
        sid = str(uuid.uuid4()); reserve(owner, sid, manifest(owner, sid, (5242880,)))
    denied(reserve(owner, raw=True), 'courtos_upload_user_budget_exceeded')
    assert sql('select sum(reserved_bytes) from public.courtos_upload_reservations;') == '20971520'
    checks.append('20 MiB per-user lifetime budget includes pending sessions')
    reset()

    owner = user(); sid = str(uuid.uuid4())
    denied(reserve(owner, sid, manifest(owner, sid, (5242881,)), raw=True), 'courtos_upload_file_too_large')
    denied(reserve(owner, sid, manifest(owner, sid, (1,)*6), raw=True), 'upload_file_count_limit_exceeded')
    denied(reserve(owner, raw=True, user_limit=0), 'courtos_upload_user_budget_exceeded')
    denied(reserve(owner, raw=True, global_limit=0), 'courtos_upload_global_budget_exceeded')
    assert sql('select count(*) from public.courtos_upload_reservations;') == '0'
    checks.append('database independently enforces file/batch limits and zero-budget pause')

    # Existing hourly session rules must roll back the newly attempted ledger row.
    reserve(owner, rate=1)
    denied(reserve(owner, rate=1, raw=True), 'upload_session_rate_limit_exceeded')
    assert sql('select count(*) from public.courtos_upload_reservations;') == '1'
    sid = str(uuid.uuid4()); malformed = manifest(owner, sid); malformed[0]['resource_id'] = None
    denied(reserve(owner, sid, malformed, raw=True), 'invalid_upload_manifest')
    assert sql('select count(*) from public.courtos_upload_reservations;') == '1'
    checks.append('base RPC validation and hourly admission failure roll back reservation atomically')
    reset()

    # Each accepted transaction deliberately holds the lock briefly to overlap peers.
    owner = user()
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: reserve(owner, user_limit=300, raw=True,
          prefix='begin;', suffix='select pg_sleep(0.05);commit;'), range(8)))
    assert sum(r.returncode == 0 for r in results) == 3, [(r.stdout,r.stderr) for r in results]
    for result in results:
        if result.returncode: denied(result, 'courtos_upload_user_budget_exceeded')
    assert sql('select count(*) from public.upload_sessions;') == '3'
    checks.append('eight simultaneous requests for one user admit exactly the three fitting reservations')
    reset()

    owners = [user() for _ in range(8)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda u: reserve(u, global_limit=300, raw=True,
          prefix='begin;', suffix='select pg_sleep(0.05);commit;'), owners))
    assert sum(r.returncode == 0 for r in results) == 3, [(r.stdout,r.stderr) for r in results]
    for result in results:
        if result.returncode: denied(result, 'courtos_upload_global_budget_exceeded')
    assert sql('select sum(reserved_bytes) from public.courtos_upload_reservations;') == '300'
    checks.append('eight simultaneous users cannot exceed the global budget')
    reset()

    owner = user(); session = str(uuid.uuid4()); files = manifest(owner, session)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: reserve(owner, session, files, raw=True), range(8)))
    assert all(r.returncode == 0 for r in results), [(r.stdout,r.stderr) for r in results]
    assert sql('select count(*) from public.courtos_upload_reservations;') == '1'
    assert sql('select count(*) from public.upload_sessions;') == '1'
    checks.append('eight simultaneous retries reserve and create exactly one session')

    for role in ['anon', 'authenticated']:
        denied(reserve(owner, prefix=f'set role {role};', raw=True), 'permission denied')
        denied(sql(f'set role {role}; select * from public.courtos_upload_reservations;', check=False), 'permission denied')
    reserve(owner, prefix='set role service_role;')
    denied(sql('set role service_role; delete from public.courtos_upload_reservations;', check=False), 'permission denied')
    checks.append('only service-role RPC can admit; browser roles cannot read; application cannot refund ledger')
    print(json.dumps(dict(passed=True, checks=checks, database=database), indent=2))
finally:
    dropped = command(['dropdb', *common, database])
    if dropped.returncode:
        raise SystemExit('Could not remove disposable test database')
