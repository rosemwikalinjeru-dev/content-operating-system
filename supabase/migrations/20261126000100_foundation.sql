-- ContentOS foundation schema.
--
-- Conventions
--   * UUID primary keys (gen_random_uuid() is core in Postgres 13+).
--   * Every user-owned row carries user_id. RLS (next migration) is user_id = auth.uid().
--   * Child -> parent references are COMPOSITE (parent_id, user_id) foreign keys. A plain FK
--     is checked without RLS, so without this a user could attach rows to another user's
--     project by guessing its id. The composite FK makes cross-tenant references impossible.
--   * Status columns are text with CHECK constraints (easier to evolve than enum types).
--   * Insert-only tables (provider_usage, performance_metrics) get no UPDATE/DELETE policies.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  budget_text_project_usd numeric(10, 4) not null default 0.50 check (budget_text_project_usd >= 0),
  budget_media_project_usd numeric(10, 4) not null default 3.00 check (budget_media_project_usd >= 0),
  budget_daily_usd numeric(10, 4) not null default 5.00 check (budget_daily_usd >= 0),
  budget_monthly_usd numeric(10, 4) not null default 50.00 check (budget_monthly_usd >= 0),
  default_monitoring_frequency text not null default 'weekly'
    check (default_monitoring_frequency in ('daily', 'weekly', 'manual')),
  preferences jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Brand
-- ---------------------------------------------------------------------------

create table public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  positioning text,
  audience jsonb not null default '{}',
  voice_profile jsonb not null default '{}',
  brand_guidelines jsonb not null default '{}',
  is_default boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

-- At most one default brand per user.
create unique index brand_profiles_one_default
  on public.brand_profiles (user_id) where is_default and deleted_at is null;

create table public.brand_knowledge (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_id uuid not null,
  kind text not null check (kind in (
    'voice_rule', 'opinion', 'experience', 'story', 'example_post',
    'offer', 'fact', 'banned_phrase', 'audience_insight'
  )),
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null,
  source text,
  -- Facts and stories must be confirmed by the owner before generation may use them.
  verified boolean not null default false,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (brand_id, user_id) references public.brand_profiles (id, user_id) on delete cascade
);

create index brand_knowledge_brand on public.brand_knowledge (brand_id, kind) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Research
-- ---------------------------------------------------------------------------

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_id uuid not null,
  name text not null,
  platform text not null check (platform in (
    'linkedin', 'x', 'instagram', 'tiktok', 'youtube', 'facebook', 'threads', 'reddit', 'web', 'other'
  )),
  profile_url text not null,
  notes text,
  enabled boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  unique (brand_id, platform, profile_url),
  foreign key (brand_id, user_id) references public.brand_profiles (id, user_id) on delete cascade
);

create table public.monitoring_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_id uuid not null,
  competitor_id uuid,
  schedule_type text not null check (schedule_type in ('competitor', 'topic', 'audience')),
  frequency text not null default 'weekly' check (frequency in ('daily', 'weekly', 'manual')),
  settings jsonb not null default '{}',
  enabled boolean not null default false,
  -- Monitoring rules only run after explicit owner approval.
  approved_at timestamptz,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (not enabled or approved_at is not null),
  foreign key (brand_id, user_id) references public.brand_profiles (id, user_id) on delete cascade,
  foreign key (competitor_id, user_id) references public.competitors (id, user_id) on delete cascade
);

create index monitoring_due on public.monitoring_schedules (next_run_at) where enabled;

create table public.research_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_id uuid not null,
  competitor_id uuid,
  provider text not null,
  source_url text,
  platform text,
  source_type text check (source_type in (
    'post', 'video', 'comment', 'article', 'transcript', 'profile', 'ad', 'thread', 'other'
  )),
  author text,
  content_text text,
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  metrics jsonb not null default '{}',
  -- true when engagement numbers are estimates rather than observed values.
  metrics_estimated boolean not null default false,
  evidence jsonb not null default '{}',
  content_hash text not null,
  unique (id, user_id),
  unique (brand_id, content_hash),
  foreign key (brand_id, user_id) references public.brand_profiles (id, user_id) on delete cascade,
  foreign key (competitor_id, user_id) references public.competitors (id, user_id) on delete set null (competitor_id)
);

create index research_sources_brand on public.research_sources (brand_id, collected_at desc);

create table public.research_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_id uuid not null,
  competitor_id uuid,
  schedule_id uuid,
  report_type text not null check (report_type in (
    'competitor', 'outliers', 'comments', 'trends', 'audience', 'listening', 'custom'
  )),
  title text not null,
  summary text,
  -- Observed facts and model interpretations are kept in separate keys of this document.
  findings jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'final', 'archived')),
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (brand_id, user_id) references public.brand_profiles (id, user_id) on delete cascade,
  foreign key (competitor_id, user_id) references public.competitors (id, user_id) on delete set null (competitor_id),
  foreign key (schedule_id, user_id) references public.monitoring_schedules (id, user_id) on delete set null (schedule_id)
);

create index research_reports_brand on public.research_reports (brand_id, created_at desc);

create table public.research_report_sources (
  report_id uuid not null,
  source_id uuid not null,
  user_id uuid not null,
  primary key (report_id, source_id),
  foreign key (report_id, user_id) references public.research_reports (id, user_id) on delete cascade,
  foreign key (source_id, user_id) references public.research_sources (id, user_id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- Ideas and projects
-- ---------------------------------------------------------------------------

create table public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_id uuid not null,
  research_report_id uuid,
  title text not null check (length(trim(title)) between 1 and 200),
  raw_input text not null check (length(raw_input) <= 20000),
  source_type text not null default 'manual' check (source_type in ('manual', 'research', 'repurpose', 'import')),
  status text not null default 'inbox' check (status in ('inbox', 'developing', 'briefed', 'archived')),
  tags text[] not null default '{}',
  analysis jsonb,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (brand_id, user_id) references public.brand_profiles (id, user_id) on delete cascade,
  foreign key (research_report_id, user_id) references public.research_reports (id, user_id) on delete set null (research_report_id)
);

-- (created_at, id) supports stable cursor pagination.
create index content_ideas_brand on public.content_ideas (brand_id, created_at desc, id desc) where deleted_at is null;
create index content_ideas_tags on public.content_ideas using gin (tags);

create table public.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  version integer not null check (version > 0),
  purpose text not null,
  body text not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name, version)
);

create table public.content_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_id uuid not null,
  idea_id uuid,
  title text not null,
  production_mode text not null check (production_mode in ('idea_to_content', 'media_to_content')),
  status text not null default 'draft' check (status in (
    'draft', 'briefing', 'in_production', 'review', 'approved', 'archived'
  )),
  budget_limit_usd numeric(10, 4) check (budget_limit_usd >= 0),
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (brand_id, user_id) references public.brand_profiles (id, user_id) on delete cascade,
  foreign key (idea_id, user_id) references public.content_ideas (id, user_id) on delete set null (idea_id)
);

create index content_projects_brand on public.content_projects (brand_id, created_at desc);

create table public.content_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid not null,
  version integer not null default 1 check (version > 0),
  brief jsonb not null,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected', 'superseded')),
  approved_at timestamptz,
  prompt_template_id uuid,
  model text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (project_id, version),
  check ((approval_status = 'approved') = (approved_at is not null) or approval_status = 'superseded'),
  foreign key (project_id, user_id) references public.content_projects (id, user_id) on delete cascade,
  foreign key (prompt_template_id, user_id) references public.prompt_templates (id, user_id)
);

-- One approved brief per project at a time.
create unique index content_briefs_one_approved
  on public.content_briefs (project_id) where approval_status = 'approved';

-- Approved briefs are immutable. The only allowed change is approved -> superseded.
create or replace function public.guard_brief_immutability()
returns trigger
language plpgsql
as $$
begin
  if old.approval_status = 'approved' then
    if new.approval_status <> 'superseded'
       or new.brief is distinct from old.brief
       or new.version <> old.version
       or new.project_id <> old.project_id then
      raise exception 'approved brief % is immutable; create a new version', old.id
        using errcode = 'P0001';
    end if;
  end if;
  if old.approval_status = 'superseded' then
    raise exception 'superseded brief % is immutable', old.id using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger content_briefs_immutable
  before update on public.content_briefs
  for each row execute function public.guard_brief_immutability();

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------

create table public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid,
  job_type text not null,
  status text not null default 'queued' check (status in (
    'queued', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled'
  )),
  idempotency_key text not null,
  progress integer not null default 0 check (progress between 0 and 100),
  current_step text,
  input jsonb not null default '{}',
  error jsonb,
  budget_limit_usd numeric(12, 6) check (budget_limit_usd >= 0),
  estimated_cost numeric(12, 6),
  actual_cost numeric(12, 6) not null default 0,
  orchestrator_run_id text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, idempotency_key),
  foreign key (project_id, user_id) references public.content_projects (id, user_id) on delete cascade
);

create index production_jobs_status on public.production_jobs (status, created_at);

create table public.job_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid not null,
  name text not null,
  position integer not null,
  status text not null default 'pending' check (status in (
    'pending', 'running', 'completed', 'failed', 'skipped', 'awaiting_approval'
  )),
  attempt integer not null default 0,
  -- Hash of the step's inputs. Same hash + completed = reuse output, never regenerate.
  input_hash text,
  output jsonb,
  error jsonb,
  cost numeric(12, 6) not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (job_id, name),
  foreign key (job_id, user_id) references public.production_jobs (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Assets and versions
-- ---------------------------------------------------------------------------

create table public.content_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid not null,
  brief_id uuid,
  platform text not null check (platform in (
    'linkedin', 'x', 'instagram', 'tiktok', 'youtube', 'blog', 'generic'
  )),
  format text not null check (format in (
    'post', 'multi_post', 'thread', 'carousel', 'short_video', 'repurposed_clip',
    'long_video', 'animated_video', 'article'
  )),
  title text,
  status text not null default 'draft' check (status in (
    'draft', 'in_review', 'approved', 'exported', 'archived'
  )),
  current_version integer not null default 1,
  approved_version integer,
  content jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (project_id, user_id) references public.content_projects (id, user_id) on delete cascade,
  foreign key (brief_id, user_id) references public.content_briefs (id, user_id)
);

create index content_assets_project on public.content_assets (project_id);

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  asset_id uuid not null,
  version integer not null check (version > 0),
  body jsonb not null,
  change_note text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected', 'superseded')),
  created_by text not null check (created_by in ('ai', 'human')),
  prompt_template_id uuid,
  provider text,
  model text,
  job_id uuid,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (asset_id, version),
  -- AI-generated versions must be traceable to a model.
  check (created_by = 'human' or model is not null),
  foreign key (asset_id, user_id) references public.content_assets (id, user_id) on delete cascade,
  foreign key (prompt_template_id, user_id) references public.prompt_templates (id, user_id),
  foreign key (job_id, user_id) references public.production_jobs (id, user_id) on delete set null (job_id)
);

-- Only one approved version per asset.
create unique index content_versions_one_approved
  on public.content_versions (asset_id) where status = 'approved';

-- Version content never changes after creation; only its status may.
create or replace function public.guard_version_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.body is distinct from old.body
     or new.version <> old.version
     or new.asset_id <> old.asset_id
     or new.created_by <> old.created_by
     or new.model is distinct from old.model then
    raise exception 'content version % is immutable; create a new version', old.id
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger content_versions_immutable
  before update on public.content_versions
  for each row execute function public.guard_version_immutability();

create table public.carousel_slides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  asset_id uuid not null,
  version integer not null,
  slide_number integer not null check (slide_number between 1 and 20),
  slide jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, version, slide_number),
  foreign key (asset_id, user_id) references public.content_assets (id, user_id) on delete cascade
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_id uuid not null,
  project_id uuid,
  job_id uuid,
  kind text not null check (kind in ('image', 'audio', 'video', 'subtitle', 'document', 'archive')),
  role text not null check (role in ('original_upload', 'generated', 'rendered', 'brand_asset')),
  storage_bucket text not null check (storage_bucket in ('uploads', 'renders', 'brand')),
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint check (size_bytes >= 0),
  duration_seconds numeric(10, 3),
  width integer,
  height integer,
  checksum text,
  -- Owner has confirmed they hold usage rights for an uploaded file.
  rights_confirmed boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  unique (storage_bucket, storage_path),
  -- Storage paths are namespaced by owner: "<user_id>/...".
  check (split_part(storage_path, '/', 1) = user_id::text),
  foreign key (brand_id, user_id) references public.brand_profiles (id, user_id) on delete cascade,
  foreign key (project_id, user_id) references public.content_projects (id, user_id) on delete set null (project_id),
  foreign key (job_id, user_id) references public.production_jobs (id, user_id) on delete set null (job_id)
);

create index media_assets_brand on public.media_assets (brand_id, created_at desc) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Quality, publishing, performance
-- ---------------------------------------------------------------------------

create table public.quality_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  asset_id uuid not null,
  version integer not null,
  reviewer_provider text,
  reviewer_model text,
  total_score numeric(5, 2) check (total_score between 0 and 100),
  dimension_scores jsonb not null default '{}',
  issues jsonb not null default '[]',
  gate_failures jsonb not null default '[]',
  factual_gate text not null default 'pending' check (factual_gate in ('pending', 'pass', 'fail', 'needs_evidence')),
  decision text not null default 'pending' check (decision in ('pending', 'pass', 'revise', 'fail', 'human_override')),
  created_at timestamptz not null default now(),
  foreign key (asset_id, user_id) references public.content_assets (id, user_id) on delete cascade,
  foreign key (asset_id, version) references public.content_versions (asset_id, version) on delete cascade
);

create index quality_reviews_asset on public.quality_reviews (asset_id, version);

create table public.publishing_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  asset_id uuid not null,
  version integer not null,
  platform text not null,
  published_url text,
  published_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (asset_id, user_id) references public.content_assets (id, user_id) on delete restrict,
  foreign key (asset_id, version) references public.content_versions (asset_id, version) on delete restrict
);

create table public.performance_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  publishing_record_id uuid not null,
  captured_at timestamptz not null default now(),
  impressions bigint,
  reactions bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  clicks bigint,
  followers_gained bigint,
  metrics jsonb not null default '{}',
  source text not null default 'manual' check (source in ('manual', 'api', 'import')),
  created_at timestamptz not null default now(),
  unique (publishing_record_id, captured_at),
  foreign key (publishing_record_id, user_id) references public.publishing_records (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- AI usage ledger (insert-only)
-- ---------------------------------------------------------------------------

create table public.provider_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid,
  job_id uuid,
  step_id uuid,
  prompt_template_id uuid,
  provider text not null,
  model text not null,
  task_type text not null,
  input_tokens integer,
  output_tokens integer,
  units numeric(14, 4),
  unit_type text,
  estimated_cost numeric(12, 6),
  actual_cost numeric(12, 6),
  duration_ms integer,
  retry_count integer not null default 0,
  status text not null check (status in ('success', 'error', 'blocked_budget', 'cached')),
  error_code text,
  created_at timestamptz not null default now(),
  foreign key (project_id, user_id) references public.content_projects (id, user_id) on delete set null (project_id),
  foreign key (job_id, user_id) references public.production_jobs (id, user_id) on delete set null (job_id),
  foreign key (step_id, user_id) references public.job_steps (id, user_id) on delete set null (step_id),
  foreign key (prompt_template_id, user_id) references public.prompt_templates (id, user_id)
);

create index provider_usage_user_time on public.provider_usage (user_id, created_at desc);
create index provider_usage_job on public.provider_usage (job_id);
create index provider_usage_project on public.provider_usage (project_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'user_settings', 'brand_profiles', 'brand_knowledge', 'competitors', 'monitoring_schedules',
    'research_reports', 'content_ideas', 'content_projects', 'production_jobs', 'job_steps',
    'content_assets', 'carousel_slides', 'media_assets', 'publishing_records'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;
