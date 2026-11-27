-- Phase 3 — Multi-format writing.
--   * One content asset per project and format (live rows).
--   * Versions record the input hash (skip unchanged regeneration), their parent version and
--     the section a revision touched.
--   * add_content_version: atomic next-version insert (locks the asset row).
--   * approve_content_version: atomic approval (one approved version per asset).
-- Both functions are SECURITY INVOKER, so RLS applies to signed-in users; the service role
-- (background jobs) inserts on the owner's behalf with the asset's user_id.

alter table public.content_versions
  add column input_hash text,
  add column parent_version integer check (parent_version is null or parent_version > 0),
  add column revised_section text;

create unique index content_assets_one_per_format
  on public.content_assets (project_id, platform, format)
  where deleted_at is null;

create index content_versions_asset on public.content_versions (asset_id, version desc);

create or replace function public.add_content_version(
  p_asset_id uuid,
  p_body jsonb,
  p_created_by text,
  p_change_note text default null,
  p_model text default null,
  p_provider text default null,
  p_prompt_template_id uuid default null,
  p_job_id uuid default null,
  p_input_hash text default null,
  p_parent_version integer default null,
  p_revised_section text default null
)
returns public.content_versions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.content_assets;
  created public.content_versions;
begin
  select * into target from public.content_assets where id = p_asset_id and deleted_at is null for update;
  if not found then
    raise exception 'asset not found' using errcode = 'P0002';
  end if;

  select coalesce(max(version), 0) + 1 into strict created.version
    from public.content_versions where asset_id = p_asset_id;

  insert into public.content_versions (
    user_id, asset_id, version, body, change_note, created_by, model, provider,
    prompt_template_id, job_id, input_hash, parent_version, revised_section
  ) values (
    target.user_id, p_asset_id, created.version, p_body, p_change_note, p_created_by, p_model, p_provider,
    p_prompt_template_id, p_job_id, p_input_hash, p_parent_version, p_revised_section
  )
  returning * into created;

  update public.content_assets
     set current_version = created.version,
         status = case when status = 'approved' then 'in_review' else status end
   where id = p_asset_id;
  return created;
end;
$$;

create or replace function public.approve_content_version(p_version_id uuid)
returns public.content_versions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.content_versions;
begin
  select * into target from public.content_versions where id = p_version_id for update;
  if not found then
    raise exception 'version not found' using errcode = 'P0002';
  end if;
  if target.status not in ('draft', 'superseded') then
    raise exception 'version cannot be approved (status: %)', target.status using errcode = 'P0001';
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

revoke all on function public.add_content_version(uuid, jsonb, text, text, text, text, uuid, uuid, text, integer, text) from public, anon;
revoke all on function public.approve_content_version(uuid) from public, anon;
grant execute on function public.add_content_version(uuid, jsonb, text, text, text, text, uuid, uuid, text, integer, text) to authenticated, service_role;
grant execute on function public.approve_content_version(uuid) to authenticated, service_role;
