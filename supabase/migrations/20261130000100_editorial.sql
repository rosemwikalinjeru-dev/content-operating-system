-- Phase 4 — Editorial intelligence.
--   * quality_reviews (existing, insert-only) gains links to the exact version, job and prompt,
--     the repetition findings and a cold-reader score.
--   * review_suggestions: targeted rewrites the owner accepts or rejects.
--   * gate_overrides: an owner's recorded reason for approving despite a failed gate (insert-only).
--   * learned_rules: voice rules proposed from the owner's edits; used only once approved.
--   * approve_content_version now refuses a version whose latest review has failed gates that
--     have not been overridden.

alter table public.quality_reviews
  add column version_id uuid,
  add column job_id uuid,
  add column prompt_template_id uuid,
  add column repetition jsonb not null default '[]',
  add column cold_reader jsonb,
  add constraint quality_reviews_version_fk foreign key (version_id, user_id)
    references public.content_versions (id, user_id) on delete cascade,
  add constraint quality_reviews_job_fk foreign key (job_id, user_id)
    references public.production_jobs (id, user_id) on delete set null (job_id),
  add constraint quality_reviews_template_fk foreign key (prompt_template_id, user_id)
    references public.prompt_templates (id, user_id);

create index quality_reviews_version on public.quality_reviews (version_id, created_at desc);

-- Composite foreign keys from review_suggestions need (id, user_id) to be unique.
alter table public.quality_reviews add constraint quality_reviews_id_user unique (id, user_id);

-- ---------------------------------------------------------------------------

create table public.review_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  review_id uuid not null,
  asset_id uuid not null,
  version_id uuid not null,
  section_key text not null check (section_key ~ '^s[0-9]{1,2}$'),
  dimension text not null,
  issue text not null check (length(issue) between 1 and 1000),
  rewrite jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  applied_version integer,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (review_id, user_id) references public.quality_reviews (id, user_id) on delete cascade,
  foreign key (asset_id, user_id) references public.content_assets (id, user_id) on delete cascade,
  foreign key (version_id, user_id) references public.content_versions (id, user_id) on delete cascade
);

create index review_suggestions_version on public.review_suggestions (version_id);

create table public.gate_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  version_id uuid not null,
  gate text not null check (length(gate) between 1 and 60),
  reason text not null check (length(trim(reason)) between 5 and 1000),
  created_at timestamptz not null default now(),
  unique (version_id, gate),
  foreign key (version_id, user_id) references public.content_versions (id, user_id) on delete cascade
);

create table public.learned_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_id uuid not null,
  rule text not null check (length(trim(rule)) between 5 and 300),
  rationale text,
  evidence jsonb not null default '[]',
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'disabled')),
  source text not null default 'edits' check (source in ('edits', 'rejected_suggestions', 'owner')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (brand_id, rule),
  foreign key (brand_id, user_id) references public.brand_profiles (id, user_id) on delete cascade
);

create index learned_rules_brand on public.learned_rules (brand_id, status);

create trigger learned_rules_set_updated_at
  before update on public.learned_rules
  for each row execute function public.set_updated_at();

-- Rejections feed rule proposals; remember which ones were already used.
alter table public.review_suggestions add column used_for_rules boolean not null default false;
alter table public.content_versions add column used_for_rules boolean not null default false;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.review_suggestions enable row level security;
alter table public.gate_overrides enable row level security;
alter table public.learned_rules enable row level security;
revoke all on public.review_suggestions, public.gate_overrides, public.learned_rules from anon, authenticated;

grant select, update on public.review_suggestions to authenticated;
create policy review_suggestions_owner_select on public.review_suggestions for select to authenticated using (user_id = (select auth.uid()));
create policy review_suggestions_owner_update on public.review_suggestions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Overrides are an audit trail: insert and read only.
grant select, insert on public.gate_overrides to authenticated;
create policy gate_overrides_owner_select on public.gate_overrides for select to authenticated using (user_id = (select auth.uid()));
create policy gate_overrides_owner_insert on public.gate_overrides for insert to authenticated with check (user_id = (select auth.uid()));

grant select, insert, update on public.learned_rules to authenticated;
create policy learned_rules_owner_select on public.learned_rules for select to authenticated using (user_id = (select auth.uid()));
create policy learned_rules_owner_insert on public.learned_rules for insert to authenticated with check (user_id = (select auth.uid()));
create policy learned_rules_owner_update on public.learned_rules for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant all on public.review_suggestions, public.gate_overrides, public.learned_rules to service_role;

-- ---------------------------------------------------------------------------
-- Approval respects gates
-- ---------------------------------------------------------------------------

create or replace function public.approve_content_version(p_version_id uuid)
returns public.content_versions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.content_versions;
  latest public.quality_reviews;
  open_gates text[];
begin
  select * into target from public.content_versions where id = p_version_id for update;
  if not found then
    raise exception 'version not found' using errcode = 'P0002';
  end if;
  if target.status not in ('draft', 'superseded') then
    raise exception 'version cannot be approved (status: %)', target.status using errcode = 'P0001';
  end if;

  select * into latest from public.quality_reviews
   where version_id = p_version_id order by created_at desc limit 1;
  if found then
    select coalesce(array_agg(g->>'code'), '{}') into open_gates
      from jsonb_array_elements(latest.gate_failures) g
     where not exists (
       select 1 from public.gate_overrides o where o.version_id = p_version_id and o.gate = g->>'code'
     );
    if array_length(open_gates, 1) > 0 then
      raise exception 'failed gates must be fixed or overridden: %', array_to_string(open_gates, ', ')
        using errcode = 'P0001';
    end if;
  end if;

  update public.content_versions
     set status = 'superseded'
   where asset_id = target.asset_id and status = 'approved';

  update public.content_versions
     set status = 'approved'
   where id = p_version_id
  returning * into target;

  update public.content_assets
     set status = 'approved', approved_version = target.version
   where id = target.asset_id;
  return target;
end;
$$;

-- Hardening: research_queries (Phase 2) inherited Supabase's default "grant all" for the
-- authenticated role (including TRUNCATE). Reset it to exactly the operations it needs.
revoke all on public.research_queries from authenticated;
grant select, insert, update, delete on public.research_queries to authenticated;
