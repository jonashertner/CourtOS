#!/usr/bin/env python3
"""Real PostgreSQL quota tests on an explicitly disposable local Unix socket.

Requires psql/createdb/dropdb on PATH. Never accepts TCP or a production DB:
creates and drops only its own randomly named test database. No app/user data.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import subprocess
import uuid

parser = argparse.ArgumentParser()
parser.add_argument("--socket", required=True)
parser.add_argument("--port", required=True, type=int)
parser.add_argument("--user", default=os.environ.get("USER", "postgres"))
args = parser.parse_args()
socket_path = Path(args.socket).resolve()
if not socket_path.is_dir() or socket_path.name != "socket" or not socket_path.parent.name.startswith("courtos-postgres-test-"):
    raise SystemExit("Only the explicitly disposable CourtOS test cluster is allowed")
database = "courtos_quota_test_" + uuid.uuid4().hex[:12]
common = ["-h", args.socket, "-p", str(args.port), "-U", args.user]
checks = []

def command(argv, **kwargs):
    return subprocess.run(argv, text=True, capture_output=True, timeout=30, **kwargs)

def sql(statement, check=True):
    p = command(["psql", *common, "-d", database, "-XAt", "-v", "ON_ERROR_STOP=1", "-c", statement])
    if check and p.returncode:
        raise RuntimeError(p.stderr)
    return p.stdout.strip() if check else p

def reserve(user, attempt=None):
    attempt = attempt or str(uuid.uuid4())
    return attempt, json.loads(sql(f"select public.courtos_reserve_native_start('{user}','{attempt}');"))

def release(user, attempt, started=True):
    sql(f"select public.courtos_release_native_start('{user}','{attempt}',{'true' if started else 'false'});")

def reset():
    sql("truncate public.courtos_native_starts;")

created = command(["createdb", *common, database])
if created.returncode:
    raise SystemExit(created.stderr)
try:
    sql("do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select from pg_roles where rolname='service_role') then create role service_role; end if; end $$;")
    migration = Path(__file__).resolve().parents[1] / "migrations/20261009_04_courtos_native_quota.sql"
    sql(migration.read_text())
    sql(migration.read_text())
    checks.append("migration is executable and idempotent")

    user = str(uuid.uuid4())
    for _ in range(3):
        attempt, result = reserve(user)
        assert result["allowed"], result
        release(user, attempt)
    assert reserve(user)[1]["reason"] == "user_daily"
    checks.append("three charged starts per user, retained across connections")
    reset()

    for _ in range(30):
        user = str(uuid.uuid4())
        attempt, result = reserve(user)
        assert result["allowed"], result
        release(user, attempt)
    assert reserve(str(uuid.uuid4()))[1]["reason"] == "global_daily"
    checks.append("thirty charged starts globally")
    reset()

    user = str(uuid.uuid4())
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: reserve(user)[1], range(8)))
    assert sum(x["allowed"] for x in results) == 1, results
    assert all(x["allowed"] or x["reason"] == "user_active" for x in results), results
    checks.append("eight concurrent requests admit exactly one for the same user")
    reset()

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: reserve(str(uuid.uuid4()))[1], range(8)))
    assert sum(x["allowed"] for x in results) == 3, results
    assert all(x["allowed"] or x["reason"] == "global_active" for x in results), results
    checks.append("eight concurrent users admit exactly three active or queued requests")
    reset()

    user = str(uuid.uuid4())
    for _ in range(5):
        attempt, result = reserve(user)
        assert result["allowed"]
        release(user, attempt, False)
    attempt, result = reserve(user)
    assert result["allowed"]
    assert reserve(user, attempt)[1]["reason"] == "duplicate"
    release(str(uuid.uuid4()), attempt)
    assert reserve(user)[1]["reason"] == "user_active"
    release(user, attempt, True)
    release(user, attempt, False)
    assert sql(f"select counted from public.courtos_native_starts where id='{attempt}';") == "t"
    checks.append("pre-inference rejection refunds; duplicate and foreign release cannot erase a charged attempt")
    reset()

    user = str(uuid.uuid4())
    for _ in range(3):
        attempt, result = reserve(user)
        assert result["allowed"]
        release(user, attempt)
    sql("update public.courtos_native_starts set created_at=(date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')-interval '1 second';")
    assert reserve(user)[1]["allowed"]
    checks.append("UTC day boundary resets daily counts")
    reset()

    user = str(uuid.uuid4())
    attempt, result = reserve(user)
    assert result["allowed"]
    sql("update public.courtos_native_starts set expires_at=now()-interval '1 second';")
    assert reserve(user)[1]["allowed"]
    assert sql("select count(*) from public.courtos_native_starts where counted;") == "2"
    checks.append("crash lease expiry frees capacity but retains daily charges")

    for role in ["anon", "authenticated"]:
        denied = sql(f"set role {role}; select public.courtos_reserve_native_start('{uuid.uuid4()}','{uuid.uuid4()}');", check=False)
        assert denied.returncode != 0 and "permission denied" in denied.stderr.lower(), denied.stderr
        denied = sql(f"set role {role}; select * from public.courtos_native_starts;", check=False)
        assert denied.returncode != 0, denied.stdout
    checks.append("anonymous and authenticated roles cannot reserve or read the ledger")
    print(json.dumps({"passed": True, "checks": checks, "database": database}, indent=2))
finally:
    dropped = command(["dropdb", *common, database])
    if dropped.returncode:
        raise SystemExit("Could not remove the disposable test database")
