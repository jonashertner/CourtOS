-- Migration date: 2026-10-10
-- Temporary owner-only research drafts, not authentication or source evidence.
create table if not exists public.courtos_research_handoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state)='object' and octet_length(state::text)<=65536),
  revision integer not null default 1 check (revision between 1 and 32),
  direction text not null default 'to_browser' check (direction in ('to_browser','to_word')),
  acknowledged_revision integer not null default 0 check (acknowledged_revision between 0 and revision),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '2 hours'),
  check (expires_at=created_at+interval '2 hours')
);
create index if not exists courtos_handoffs_owner_expiry_idx on public.courtos_research_handoffs(user_id,expires_at);
create index if not exists courtos_handoffs_expiry_idx on public.courtos_research_handoffs(expires_at);
alter table public.courtos_research_handoffs enable row level security;
revoke all on public.courtos_research_handoffs from public,anon,authenticated,service_role;

-- Called inside the same transaction as the read/write. SHARE row locks keep
-- removal, reassignment and version replacement behind the ownership check.
-- The API additionally validates every nested field and never treats a cached
-- quote or sender-provided metadata as a verified source.
create or replace function public.courtos_handoff_private_refs_allowed(p_user_id uuid,p_state jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare r record; d public.documents%rowtype; v public.document_versions%rowtype;
begin
  if jsonb_typeof(p_state) is distinct from 'object'
    or p_state->>'version' is distinct from '1'
    or jsonb_typeof(p_state->'private') is distinct from 'object'
    or jsonb_typeof(p_state#>'{private,selected}') is distinct from 'array'
    or jsonb_array_length(p_state#>'{private,selected}')>20 then return false; end if;
  if p_state#>'{private,result}' is distinct from 'null'::jsonb and (
    jsonb_typeof(p_state#>'{private,result,results}') is distinct from 'array'
    or jsonb_typeof(p_state#>'{private,result,documents}') is distinct from 'array'
    or jsonb_array_length(p_state#>'{private,result,results}')>12
    or jsonb_array_length(p_state#>'{private,result,documents}')>20) then return false; end if;
  if p_state#>'{private,source}' is distinct from 'null'::jsonb and
    jsonb_typeof(p_state#>'{private,source}') is distinct from 'object' then return false; end if;
  for r in
    select x->>'id' as doc_id,x->>'active_version_id' as version_id,true as selected,
      null::integer as page,null::text as quote,null::text as filename,null::integer as version_number
      from jsonb_array_elements(p_state#>'{private,selected}') x
    union all select x->>'document_id',x->>'version_id',false,
      (x->>'page')::integer,x->>'quote',x->>'filename',(x->>'version_number')::integer
      from jsonb_array_elements(coalesce(p_state#>'{private,result,results}','[]'::jsonb)) x
    union all select x->>'document_id',x->>'version_id',false,null,null,null,null
      from jsonb_array_elements(coalesce(p_state#>'{private,result,documents}','[]'::jsonb)) x
    union all select p_state#>>'{private,source,document_id}',p_state#>>'{private,source,version_id}',false,
      (p_state#>>'{private,source,page}')::integer,p_state#>>'{private,source,quote}',
      p_state#>>'{private,source,filename}',(p_state#>>'{private,source,version_number}')::integer
      where p_state#>'{private,source}' is distinct from 'null'::jsonb
    order by doc_id,version_id
  loop
    if r.doc_id is null or (not r.selected and r.version_id is null) then return false; end if;
    select * into d from public.documents where id=r.doc_id::uuid for share;
    if not found or d.user_id is distinct from p_user_id or d.project_id is not null
      or d.org_id is not null or d.workflow_id is not null or coalesce(d.library_kind,'file')<>'file'
      or d.status is distinct from 'ready' then return false; end if;
    if r.selected and d.current_version_id is distinct from r.version_id::uuid then return false; end if;
    if r.version_id is not null then
      select * into v from public.document_versions where id=r.version_id::uuid for share;
      if not found or v.document_id is distinct from d.id or v.deleted_at is not null then return false; end if;
      if r.quote is not null then
        -- A handoff is no citation authority: revalidate literal search hits
        -- against the exact indexed PDF page of this immutable version. The
        -- existing version-content trigger deletes this index on replacement.
        -- This establishes quotation provenance, never support for a claim.
        if r.filename is distinct from v.filename or r.version_number is distinct from v.version_number
          or v.courtos_knowledge_index is null or r.page is null
          or not exists(select 1 from public.courtos_knowledge_passages p
            where p.version_id=v.id and p.page=r.page and p.quote=r.quote) then return false; end if;
      end if;
    end if;
  end loop;
  return true;
exception when invalid_text_representation then return false;
end $$;
revoke all on function public.courtos_handoff_private_refs_allowed(uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function public.courtos_research_handoff(
  p_user_id uuid,p_action text,p_id uuid default null,p_expected_revision integer default null,
  p_state jsonb default null,p_direction text default null,p_metadata_only boolean default false
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public set statement_timeout='3s' as $$
declare h public.courtos_research_handoffs%rowtype; result jsonb; stamp timestamptz:=clock_timestamp();
begin
  if p_user_id is null or p_action is null or p_action not in ('create','read','update','ack') then
    return jsonb_build_object('status','invalid'); end if;
  if p_action in ('create','update') and (p_state is null or jsonb_typeof(p_state)<>'object'
    or octet_length(p_state::text)>65536) then return jsonb_build_object('status','invalid'); end if;
  if p_action in ('update','ack') and (p_expected_revision is null or p_expected_revision not between 1 and 32) then
    return jsonb_build_object('status','invalid'); end if;
  if p_action='update' and (p_direction is null or p_direction not in ('to_browser','to_word')) then
    return jsonb_build_object('status','invalid'); end if;

  -- Every operation takes its owner lock before touching rows. Creation then
  -- takes global admission: never prune a row before acquiring the owner lock,
  -- or a read holding that lock could wait on the row while creation waits on it.
  perform pg_advisory_xact_lock(hashtextextended('courtos-handoff:'||p_user_id::text,0));
  if p_action='create' then
    perform pg_advisory_xact_lock(hashtextextended('courtos-handoff-create',0));
    stamp:=clock_timestamp();
    delete from public.courtos_research_handoffs where expires_at<=stamp;
    if (select count(*) from public.courtos_research_handoffs)>=512 then
      return jsonb_build_object('status','limit'); end if;
  end if;
  stamp:=clock_timestamp();
  -- Opportunistic erasure, not merely hiding expired payloads. Expiry is fixed
  -- and never extended by reads, revisions or acknowledgement.
  delete from public.courtos_research_handoffs where user_id=p_user_id and expires_at<=stamp;
  if p_action='create' then
    if not public.courtos_handoff_private_refs_allowed(p_user_id,p_state) then return jsonb_build_object('status','not_found'); end if;
    if (select count(*) from public.courtos_research_handoffs where user_id=p_user_id)>=4 then
      return jsonb_build_object('status','limit'); end if;
    insert into public.courtos_research_handoffs(user_id,state,created_at,expires_at)
      values(p_user_id,p_state,stamp,stamp+interval '2 hours') returning * into h;
  else
    select * into h from public.courtos_research_handoffs where id=p_id and user_id=p_user_id and expires_at>stamp for update;
    if not found then return jsonb_build_object('status','not_found'); end if;
    if not public.courtos_handoff_private_refs_allowed(p_user_id,h.state) then return jsonb_build_object('status','not_found'); end if;
    if p_action in ('update','ack') and h.revision<>p_expected_revision then return jsonb_build_object('status','conflict'); end if;
    if p_action='update' then
      if h.revision>=32 then return jsonb_build_object('status','revision_limit'); end if;
      if not public.courtos_handoff_private_refs_allowed(p_user_id,p_state) then return jsonb_build_object('status','not_found'); end if;
      update public.courtos_research_handoffs set state=p_state,revision=revision+1,direction=p_direction
        where id=h.id returning * into h;
    elsif p_action='ack' then
      update public.courtos_research_handoffs set acknowledged_revision=revision where id=h.id returning * into h;
    end if;
  end if;
  result:=jsonb_build_object('id',h.id,'revision',h.revision,'expires_at',h.expires_at,
    'direction',h.direction,'acknowledged_revision',h.acknowledged_revision);
  if p_action='read' and not coalesce(p_metadata_only,false) then result:=result||jsonb_build_object('state',h.state); end if;
  return jsonb_build_object('status','ok','record',result);
end $$;
revoke all on function public.courtos_research_handoff(uuid,text,uuid,integer,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.courtos_research_handoff(uuid,text,uuid,integer,jsonb,text,boolean) to service_role;
notify pgrst,'reload schema';
