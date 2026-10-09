-- Migration date: 2026-10-09
-- Opt-in CourtOS pilot: conservative lifetime upload reservations. No FK or
-- automatic refund: cancellation, failure and document/account deletion must
-- not reopen a public user's budget. Explicit operator cleanup is separate.
create table if not exists public.courtos_upload_reservations (
  session_id uuid primary key,
  user_id uuid not null,
  reserved_bytes bigint not null check (reserved_bytes > 0),
  file_count integer not null check (file_count > 0),
  manifest_sha256 text,
  created_at timestamptz not null default now()
);
create index if not exists courtos_upload_reservations_user_idx
  on public.courtos_upload_reservations(user_id);
alter table public.courtos_upload_reservations enable row level security;
revoke all on public.courtos_upload_reservations from public, anon, authenticated;
grant select on public.courtos_upload_reservations to service_role;

-- Existing sessions count even if pending, failed, cancelled or complete.
-- They predate the fingerprint protocol, so cannot be retried as new sessions.
insert into public.courtos_upload_reservations
  (session_id, user_id, reserved_bytes, file_count, created_at)
select id, user_id, expected_total_bytes, expected_file_count, created_at
from public.upload_sessions
where expected_total_bytes > 0 and expected_file_count > 0
on conflict (session_id) do nothing;

create or replace function public.create_courtos_upload_session(
  target_session_id uuid,
  target_user_id uuid,
  target_purpose text,
  target_destination jsonb,
  target_expires_at timestamptz,
  target_files jsonb,
  target_hourly_session_limit integer,
  target_max_file_bytes bigint,
  target_max_batch_files integer,
  target_user_total_bytes bigint,
  target_global_total_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  file_count integer;
  total_bytes bigint;
  manifest_hash text;
  prior public.courtos_upload_reservations%rowtype;
  live_session public.upload_sessions%rowtype;
  user_bytes bigint;
  global_bytes bigint;
begin
  if target_session_id is null or target_user_id is null
     or target_purpose is null or target_destination is null
     or target_expires_at is null
     or target_files is null or jsonb_typeof(target_files) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_upload_manifest';
  end if;
  if target_max_file_bytes is null or target_max_file_bytes not between 1 and 104857600
     or target_max_batch_files is null or target_max_batch_files not between 1 and 50
     or target_user_total_bytes is null or target_user_total_bytes not between 0 and 9007199254740991
     or target_global_total_bytes is null or target_global_total_bytes not between 0 and 9007199254740991
     or target_hourly_session_limit is null then
    raise exception using errcode = '22023', message = 'invalid_courtos_upload_limits';
  end if;
  select count(*), coalesce(sum(f.expected_size_bytes), 0)
    into file_count, total_bytes
  from jsonb_to_recordset(target_files) as f(expected_size_bytes bigint);
  if file_count < 1 or file_count > target_max_batch_files then
    raise exception using errcode = '22023', message = 'upload_file_count_limit_exceeded';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(target_files) as f(expected_size_bytes bigint)
    where f.expected_size_bytes is null or f.expected_size_bytes < 1
       or f.expected_size_bytes > target_max_file_bytes
  ) then
    raise exception using errcode = '22023', message = 'courtos_upload_file_too_large';
  end if;
  select encode(sha256(convert_to(jsonb_build_object(
    'purpose', target_purpose, 'destination', target_destination,
    'files', (select jsonb_agg(f order by f->>'id') from jsonb_array_elements(target_files) f)
  )::text, 'UTF8')), 'hex') into manifest_hash;

  -- All pilot admissions share this lock, then the original RPC takes its
  -- per-user upload-session lock. Count + reserve + session insert are atomic.
  perform pg_advisory_xact_lock(hashtextextended('courtos-upload-budget', 0));
  select * into prior from public.courtos_upload_reservations
    where session_id = target_session_id;
  if found then
    if prior.user_id <> target_user_id or prior.manifest_sha256 is distinct from manifest_hash then
      raise exception using errcode = 'P0001', message = 'courtos_upload_session_conflict';
    end if;
    select * into live_session from public.upload_sessions
      where id = target_session_id and user_id = target_user_id;
    if not found or live_session.status <> 'pending_upload' or live_session.expires_at <= now() then
      raise exception using errcode = 'P0001', message = 'courtos_upload_session_closed';
    end if;
    return jsonb_build_object('expires_at', live_session.expires_at);
  end if;

  select coalesce(sum(reserved_bytes), 0),
         coalesce(sum(reserved_bytes) filter (where user_id = target_user_id), 0)
    into global_bytes, user_bytes from public.courtos_upload_reservations;
  if total_bytes > target_user_total_bytes - user_bytes then
    raise exception using errcode = 'P0001', message = 'courtos_upload_user_budget_exceeded';
  end if;
  if total_bytes > target_global_total_bytes - global_bytes then
    raise exception using errcode = 'P0001', message = 'courtos_upload_global_budget_exceeded';
  end if;

  insert into public.courtos_upload_reservations
    (session_id, user_id, reserved_bytes, file_count, manifest_sha256)
  values (target_session_id, target_user_id, total_bytes, file_count, manifest_hash);
  perform public.create_upload_session(target_session_id, target_user_id,
    target_purpose, target_destination, target_expires_at, target_files,
    target_hourly_session_limit);
  return jsonb_build_object('expires_at', target_expires_at);
end;
$$;
revoke all on function public.create_courtos_upload_session(uuid, uuid, text, jsonb, timestamptz, jsonb, integer, bigint, integer, bigint, bigint) from public, anon, authenticated;
grant execute on function public.create_courtos_upload_session(uuid, uuid, text, jsonb, timestamptz, jsonb, integer, bigint, integer, bigint, bigint) to service_role;
