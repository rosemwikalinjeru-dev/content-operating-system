-- Phase 1: content intelligence.
--   * Full-text search over brand knowledge (no embeddings provider needed yet).
--   * Which knowledge generation may use: facts, stories and experiences only once verified.
--   * AI spend aggregation for budget enforcement.
--   * Atomic brief approval (supersedes the previously approved version).
--   * Idea analysis bookkeeping (input hash, so unchanged ideas are never re-analysed).

-- ---------------------------------------------------------------------------
-- Brand knowledge search
-- ---------------------------------------------------------------------------

alter table public.brand_knowledge
  add column search tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) stored;

create index brand_knowledge_search on public.brand_knowledge using gin (search);

-- Generation may only use knowledge the owner stands behind: facts, stories and experiences
-- must be verified; rules, opinions, examples and insights are usable as written.
create or replace function public.knowledge_is_usable(kind text, verified boolean)
returns boolean
language sql
immutable
as $$
  select verified or kind not in ('fact', 'story', 'experience')
$$;

-- Ranked knowledge for a brand. SECURITY INVOKER: runs under the caller's RLS.
create or replace function public.search_brand_knowledge(
  p_brand_id uuid,
  p_query text,
  p_limit integer default 8
)
returns table (id uuid, kind text, title text, body text, rank real)
language sql
stable
security invoker
set search_path = ''
as $$
  select k.id, k.kind, k.title, k.body,
         ts_rank(k.search, websearch_to_tsquery('english', p_query)) as rank
  from public.brand_knowledge k
  where k.brand_id = p_brand_id
    and k.deleted_at is null
    and public.knowledge_is_usable(k.kind, k.verified)
    and k.search @@ websearch_to_tsquery('english', p_query)
  order by rank desc, k.created_at desc
  limit least(greatest(p_limit, 1), 25)
$$;

-- ---------------------------------------------------------------------------
-- AI spend
-- ---------------------------------------------------------------------------

-- Spend since a point in time, optionally for one project. Uses actual cost when known,
-- otherwise the estimate. SECURITY INVOKER: callers only see their own rows under RLS;
-- workers (service role) must pass the user id explicitly.
create or replace function public.ai_spend(
  p_user_id uuid,
  p_since timestamptz,
  p_project_id uuid default null
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(coalesce(u.actual_cost, u.estimated_cost, 0)), 0)
  from public.provider_usage u
  where u.user_id = p_user_id
    and u.created_at >= p_since
    and (p_project_id is null or u.project_id = p_project_id)
    and u.status in ('success', 'error')
$$;

-- ---------------------------------------------------------------------------
-- Briefs
-- ---------------------------------------------------------------------------

-- Approve one brief version atomically: supersede the currently approved version of the same
-- project, then approve this one. SECURITY INVOKER, so RLS limits it to the caller's briefs.
create or replace function public.approve_brief(p_brief_id uuid)
returns public.content_briefs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.content_briefs;
begin
  select * into target from public.content_briefs where id = p_brief_id for update;
  if not found then
    raise exception 'brief not found' using errcode = 'P0002';
  end if;
  if target.approval_status <> 'pending' then
    raise exception 'only pending briefs can be approved (status: %)', target.approval_status
      using errcode = 'P0001';
  end if;

  update public.content_briefs
     set approval_status = 'superseded'
   where project_id = target.project_id and approval_status = 'approved';

  update public.content_briefs
     set approval_status = 'approved', approved_at = now()
   where id = p_brief_id
  returning * into target;

  update public.content_projects set status = 'briefing' where id = target.project_id and status = 'draft';
  return target;
end;
$$;

grant execute on function public.approve_brief(uuid) to authenticated;
grant execute on function public.search_brand_knowledge(uuid, text, integer) to authenticated;
grant execute on function public.ai_spend(uuid, timestamptz, uuid) to authenticated;
grant execute on function public.knowledge_is_usable(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Ideas
-- ---------------------------------------------------------------------------

alter table public.content_ideas
  add column analysis_input_hash text,
  add column analyzed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Brief generation needs a place to record its source idea version
-- ---------------------------------------------------------------------------

alter table public.content_briefs
  add column input_hash text,
  add column job_id uuid;

alter table public.content_briefs
  add constraint content_briefs_job_fk foreign key (job_id, user_id)
  references public.production_jobs (id, user_id) on delete set null (job_id);
