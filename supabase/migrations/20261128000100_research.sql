-- Phase 2: research intelligence.
--   * Competitors gain relationship type, priority and study focus (owner watchlist).
--   * Research queries: problem clusters with audience-language search terms and the
--     saturation benchmark (docs/research/research-keywords.json).
--   * Research sources gain query link, labels and outlier metrics.
--   * Reports link to the job that produced them.

alter table public.competitors
  add column relationship text not null default 'direct_competitor'
    check (relationship in ('direct_competitor', 'positioning_benchmark', 'craft_benchmark')),
  add column priority integer check (priority between 1 and 99),
  add column study_focus text,
  add column last_collected_at timestamptz;

create table public.research_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_id uuid not null,
  cluster_id text not null check (length(cluster_id) between 1 and 40),
  cluster_name text not null,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'benchmark')),
  kind text not null check (kind in ('audience_language', 'concept', 'saturation')),
  query text not null check (length(trim(query)) between 2 and 200),
  platforms text[] not null default '{reddit,youtube}',
  enabled boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (brand_id, kind, query),
  check (platforms <@ array['reddit', 'youtube', 'tiktok', 'threads', 'instagram', 'x', 'linkedin']::text[]),
  foreign key (brand_id, user_id) references public.brand_profiles (id, user_id) on delete cascade
);

create index research_queries_brand on public.research_queries (brand_id, priority, enabled);

create trigger research_queries_set_updated_at
  before update on public.research_queries
  for each row execute function public.set_updated_at();

alter table public.research_queries enable row level security;
revoke all on public.research_queries from anon;
grant select, insert, update, delete on public.research_queries to authenticated;
create policy research_queries_owner_select on public.research_queries for select to authenticated using (user_id = (select auth.uid()));
create policy research_queries_owner_insert on public.research_queries for insert to authenticated with check (user_id = (select auth.uid()));
create policy research_queries_owner_update on public.research_queries for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy research_queries_owner_delete on public.research_queries for delete to authenticated using (user_id = (select auth.uid()));

-- Sources: provenance and analysis results. Raw evidence stays in `evidence`; these columns
-- are derived and may be recomputed.
alter table public.research_sources
  add column query_id uuid,
  add column job_id uuid,
  add column engagement numeric(18, 4),
  add column lift numeric(12, 4),
  add column baseline_kind text check (baseline_kind in ('author', 'query', 'none')),
  add column outlier_tier text check (outlier_tier in ('huge', 'strong', 'mild', 'none')),
  add column labels jsonb not null default '{}';

alter table public.research_sources
  add constraint research_sources_query_fk foreign key (query_id, user_id)
    references public.research_queries (id, user_id) on delete set null (query_id),
  add constraint research_sources_job_fk foreign key (job_id, user_id)
    references public.production_jobs (id, user_id) on delete set null (job_id);

create index research_sources_job on public.research_sources (job_id);

alter table public.research_reports
  add column job_id uuid,
  add constraint research_reports_job_fk foreign key (job_id, user_id)
    references public.production_jobs (id, user_id) on delete set null (job_id);

-- Background jobs (service role) need the new table too.
grant all on public.research_queries to service_role;
