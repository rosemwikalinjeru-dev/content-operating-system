-- Phase 5 — Visual and carousel.
--   * carousel_designs: immutable design versions of a carousel narrative asset (slides + template).
--   * add_carousel_design: atomic next-version insert (locks the asset row).
-- Exports are recorded in media_assets (rendered PNG/PDF/ZIP in the private "renders" bucket).

create table public.carousel_designs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  asset_id uuid not null,
  version integer not null check (version > 0),
  source_version integer not null check (source_version > 0),
  template text not null check (template in ('statement', 'before_after', 'process', 'screenshot', 'notebook')),
  slides jsonb not null,
  change_note text,
  created_by text not null check (created_by in ('ai', 'human')),
  model text,
  prompt_template_id uuid,
  job_id uuid,
  parent_version integer,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (asset_id, version),
  check (created_by = 'human' or model is not null),
  check (jsonb_typeof(slides) = 'array'),
  foreign key (asset_id, user_id) references public.content_assets (id, user_id) on delete cascade,
  foreign key (prompt_template_id, user_id) references public.prompt_templates (id, user_id),
  foreign key (job_id, user_id) references public.production_jobs (id, user_id) on delete set null (job_id)
);

create index carousel_designs_asset on public.carousel_designs (asset_id, version desc);

-- Designs never change after creation; edits create a new version.
create or replace function public.guard_design_immutability()
returns trigger
language plpgsql
as $$
begin
  raise exception 'carousel design % is immutable; create a new version', old.id using errcode = 'P0001';
end;
$$;

create trigger carousel_designs_immutable
  before update on public.carousel_designs
  for each row execute function public.guard_design_immutability();

create or replace function public.add_carousel_design(
  p_asset_id uuid,
  p_source_version integer,
  p_template text,
  p_slides jsonb,
  p_created_by text,
  p_change_note text default null,
  p_model text default null,
  p_prompt_template_id uuid default null,
  p_job_id uuid default null,
  p_parent_version integer default null
)
returns public.carousel_designs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.content_assets;
  created public.carousel_designs;
  next_version integer;
begin
  select * into target from public.content_assets where id = p_asset_id and deleted_at is null for update;
  if not found then
    raise exception 'asset not found' using errcode = 'P0002';
  end if;
  if target.format <> 'carousel' then
    raise exception 'only carousel assets have designs' using errcode = 'P0001';
  end if;

  select coalesce(max(version), 0) + 1 into next_version from public.carousel_designs where asset_id = p_asset_id;

  insert into public.carousel_designs (
    user_id, asset_id, version, source_version, template, slides, change_note, created_by, model,
    prompt_template_id, job_id, parent_version
  ) values (
    target.user_id, p_asset_id, next_version, p_source_version, p_template, p_slides, p_change_note, p_created_by, p_model,
    p_prompt_template_id, p_job_id, p_parent_version
  )
  returning * into created;
  return created;
end;
$$;

alter table public.carousel_designs enable row level security;
revoke all on public.carousel_designs from anon, authenticated;
grant select on public.carousel_designs to authenticated;
create policy carousel_designs_owner_select on public.carousel_designs for select to authenticated using (user_id = (select auth.uid()));
-- Inserts go through add_carousel_design (security invoker), which needs insert rights under RLS.
grant insert on public.carousel_designs to authenticated;
create policy carousel_designs_owner_insert on public.carousel_designs for insert to authenticated with check (user_id = (select auth.uid()));
grant all on public.carousel_designs to service_role;

revoke all on function public.add_carousel_design(uuid, integer, text, jsonb, text, text, text, uuid, uuid, integer) from public, anon;
grant execute on function public.add_carousel_design(uuid, integer, text, jsonb, text, text, text, uuid, uuid, integer) to authenticated, service_role;

create index media_assets_project_kind on public.media_assets (project_id, kind) where deleted_at is null;
