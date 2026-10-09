-- Migration date: 2026-10-09
-- CourtOS native pilot: atomic UTC-day counters and durable active leases.
-- No document, prompt, email or model output is stored here.
create table if not exists public.courtos_native_starts (
  id uuid primary key,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '25 minutes'),
  released_at timestamptz,
  counted boolean not null default true
);
create index if not exists courtos_native_starts_day_idx on public.courtos_native_starts(created_at, user_id);
alter table public.courtos_native_starts enable row level security;
revoke all on public.courtos_native_starts from public, anon, authenticated;
grant select, insert, update on public.courtos_native_starts to service_role;

create or replace function public.courtos_reserve_native_start(p_user_id uuid, p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  day_retry integer;
begin
  if p_user_id is null or p_attempt_id is null then raise exception 'Missing quota identity'; end if;
  perform pg_advisory_xact_lock(hashtextextended('courtos-native-quota', 0));
  day_retry := greatest(1, ceil(extract(epoch from day_start + interval '1 day' - now()))::integer);
  if exists(select 1 from public.courtos_native_starts where id=p_attempt_id) then
    return jsonb_build_object('allowed', false, 'reason', 'duplicate', 'retry_after', 60);
  end if;
  if exists(select 1 from public.courtos_native_starts where user_id=p_user_id and released_at is null and expires_at>now()) then
    return jsonb_build_object('allowed', false, 'reason', 'user_active', 'retry_after', 60);
  end if;
  if (select count(*) from public.courtos_native_starts where released_at is null and expires_at>now()) >= 3 then
    return jsonb_build_object('allowed', false, 'reason', 'global_active', 'retry_after', 60);
  end if;
  if (select count(*) from public.courtos_native_starts where counted and created_at>=day_start and user_id=p_user_id) >= 3 then
    return jsonb_build_object('allowed', false, 'reason', 'user_daily', 'retry_after', day_retry);
  end if;
  if (select count(*) from public.courtos_native_starts where counted and created_at>=day_start) >= 30 then
    return jsonb_build_object('allowed', false, 'reason', 'global_daily', 'retry_after', day_retry);
  end if;
  insert into public.courtos_native_starts(id,user_id) values(p_attempt_id,p_user_id);
  return jsonb_build_object('allowed', true);
end $$;

create or replace function public.courtos_release_native_start(p_user_id uuid, p_attempt_id uuid, p_model_started boolean)
returns void language sql security definer set search_path = public as $$
  update public.courtos_native_starts set released_at=now(), counted=coalesce(p_model_started,true)
  where id=p_attempt_id and user_id=p_user_id and released_at is null;
$$;
revoke all on function public.courtos_reserve_native_start(uuid,uuid) from public, anon, authenticated;
revoke all on function public.courtos_release_native_start(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.courtos_reserve_native_start(uuid,uuid) to service_role;
grant execute on function public.courtos_release_native_start(uuid,uuid,boolean) to service_role;
notify pgrst, 'reload schema';
