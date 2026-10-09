-- Migration date: 2026-10-09
-- Derived, disposable passage index; existing document_versions owns identity.
alter table public.document_versions add column if not exists courtos_knowledge_index jsonb;
create table if not exists public.courtos_knowledge_passages (
  version_id uuid not null references public.document_versions(id) on delete cascade,
  ordinal integer not null check(ordinal >= 0),
  page integer not null check(page > 0),
  quote text not null check(char_length(quote) between 1 and 1600),
  terms tsvector generated always as (to_tsvector('simple'::regconfig, quote)) stored,
  primary key(version_id, ordinal)
);
create index if not exists courtos_knowledge_terms_idx on public.courtos_knowledge_passages using gin(terms);
alter table public.courtos_knowledge_passages enable row level security;
revoke all on public.courtos_knowledge_passages from public, anon, authenticated, service_role;
-- Writes only through the bounded SECURITY DEFINER RPC / lifecycle trigger.
grant select on public.courtos_knowledge_passages to service_role;

create or replace function public.courtos_invalidate_knowledge_index()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.storage_path is distinct from new.storage_path
     or old.pdf_storage_path is distinct from new.pdf_storage_path
     or old.content_sha256 is distinct from new.content_sha256
     or old.deleted_at is distinct from new.deleted_at then
    delete from public.courtos_knowledge_passages where version_id=old.id;
    new.courtos_knowledge_index := null;
  end if;
  return new;
end $$;
drop trigger if exists courtos_invalidate_knowledge_index on public.document_versions;
create trigger courtos_invalidate_knowledge_index before update of storage_path,pdf_storage_path,content_sha256,deleted_at
on public.document_versions for each row execute function public.courtos_invalidate_knowledge_index();
revoke all on function public.courtos_invalidate_knowledge_index() from public,anon,authenticated;

create or replace function public.courtos_store_knowledge_index(
  p_user_id uuid, p_document_id uuid, p_version_id uuid,
  p_storage_path text, p_pdf_storage_path text, p_content_sha256 text,
  p_metadata jsonb, p_passages jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.document_versions%rowtype; new_bytes bigint; global_bytes bigint; user_bytes bigint;
begin
  -- Lock the authoritative version; a concurrent replacement either precedes
  -- this snapshot check or follows it and invalidates the derived index.
  select * into v from public.document_versions where id=p_version_id for update;
  if not found or v.document_id<>p_document_id or v.deleted_at is not null
     or v.storage_path is distinct from p_storage_path
     or v.pdf_storage_path is distinct from p_pdf_storage_path
     or v.content_sha256 is distinct from p_content_sha256 then return jsonb_build_object('stored',false); end if;
  if not exists(select 1 from public.documents d where d.id=p_document_id and d.user_id=p_user_id
      and d.project_id is null and d.org_id is null and d.workflow_id is null
      and coalesce(d.library_kind,'file')='file' and d.status='ready' and d.current_version_id=p_version_id) then return jsonb_build_object('stored',false); end if;
  if jsonb_typeof(p_passages) is distinct from 'array' or jsonb_array_length(p_passages)>400
     or coalesce(p_metadata->>'index_status','') not in ('ready','partial','unreadable') then raise exception 'Invalid passage index'; end if;
  select coalesce(sum(octet_length(item->>'quote')),0) into new_bytes from jsonb_array_elements(p_passages) as x(item);
  if new_bytes>500000 then raise exception 'Passage byte limit'; end if;
  perform pg_advisory_xact_lock(hashtextextended('courtos-knowledge-bytes',0));
  select coalesce(sum(octet_length(c.quote)),0),coalesce(sum(octet_length(c.quote)) filter(where d.user_id=p_user_id),0)
    into global_bytes,user_bytes from public.courtos_knowledge_passages c
    join public.document_versions dv on dv.id=c.version_id join public.documents d on d.id=dv.document_id
    where c.version_id<>p_version_id;
  delete from public.courtos_knowledge_passages where version_id=p_version_id;
  if global_bytes+new_bytes>67108864 or user_bytes+new_bytes>8388608 then
    p_passages := '[]'::jsonb;
    p_metadata := p_metadata || jsonb_build_object('index_status','unreadable','indexed_pages',0,'reason','index_budget');
  end if;
  insert into public.courtos_knowledge_passages(version_id,ordinal,page,quote)
    select p_version_id, ordinality::integer-1, (item->>'page')::integer, item->>'quote'
    from jsonb_array_elements(p_passages) with ordinality as x(item,ordinality);
  update public.document_versions set courtos_knowledge_index=p_metadata where id=p_version_id;
  return jsonb_build_object('stored',true,'metadata',p_metadata);
end $$;
revoke all on function public.courtos_store_knowledge_index(uuid,uuid,uuid,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.courtos_store_knowledge_index(uuid,uuid,uuid,text,text,text,jsonb,jsonb) to service_role;

create or replace function public.courtos_search_knowledge(p_user_id uuid,p_document_ids uuid[],p_query text,p_limit integer default 10)
returns table(document_id uuid,version_id uuid,version_number integer,filename text,page integer,quote text,score real)
language sql stable security definer set search_path=public set statement_timeout='3s' as $$
  -- MATERIALIZED makes access filtering precede relevance scoring/snippets.
  with permitted as materialized (
    select d.id as document_id,v.id as version_id,v.version_number,v.filename
    from public.documents d join public.document_versions v on v.id=d.current_version_id and v.document_id=d.id
    where d.user_id=p_user_id and d.project_id is null and d.org_id is null and d.workflow_id is null
      and coalesce(d.library_kind,'file')='file' and d.status='ready' and v.deleted_at is null
      and d.id=any(p_document_ids[1:20]) and v.courtos_knowledge_index is not null
  ), allowed_passages as materialized (
    select p.*,c.ordinal,c.page,c.quote,c.terms from permitted p join public.courtos_knowledge_passages c on c.version_id=p.version_id
  ), q as (select websearch_to_tsquery('simple',left(p_query,300)) as value)
  select a.document_id,a.version_id,a.version_number,a.filename,a.page,a.quote,ts_rank_cd(a.terms,q.value) as score
  from allowed_passages a cross join q where a.terms@@q.value
  order by score desc,a.document_id,a.page,a.ordinal limit greatest(1,least(p_limit,20));
$$;
revoke all on function public.courtos_search_knowledge(uuid,uuid[],text,integer) from public,anon,authenticated;
grant execute on function public.courtos_search_knowledge(uuid,uuid[],text,integer) to service_role;
notify pgrst,'reload schema';
