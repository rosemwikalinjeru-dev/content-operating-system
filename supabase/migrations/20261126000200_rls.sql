-- Row-level security.
--
-- Every user-owned table: RLS on, owner-only policies for the `authenticated` role.
-- Operations are granted per table, not blanket CRUD:
--   * evidence and ledgers are insert-only (no UPDATE, no DELETE)
--   * records that are soft-deleted get no DELETE policy
--   * versions and briefs cannot be deleted from the client
-- Background workers use the service role, which bypasses RLS by design; it never reaches
-- the browser.
-- `(select auth.uid())` is evaluated once per statement instead of per row.

-- The anonymous role never touches application tables.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

do $$
declare
  spec record;
  op text;
begin
  for spec in
    select * from (values
      ('user_settings',            array['select', 'insert', 'update']),
      ('brand_profiles',           array['select', 'insert', 'update']),
      ('brand_knowledge',          array['select', 'insert', 'update']),
      ('competitors',              array['select', 'insert', 'update']),
      ('monitoring_schedules',     array['select', 'insert', 'update', 'delete']),
      ('research_sources',         array['select', 'insert']),
      ('research_reports',         array['select', 'insert', 'update']),
      ('research_report_sources',  array['select', 'insert', 'delete']),
      ('content_ideas',            array['select', 'insert', 'update']),
      ('prompt_templates',         array['select', 'insert']),
      ('content_projects',         array['select', 'insert', 'update']),
      ('content_briefs',           array['select', 'insert', 'update']),
      ('production_jobs',          array['select', 'insert', 'update']),
      ('job_steps',                array['select', 'insert', 'update']),
      ('content_assets',           array['select', 'insert', 'update']),
      ('content_versions',         array['select', 'insert', 'update']),
      ('carousel_slides',          array['select', 'insert', 'update', 'delete']),
      ('media_assets',             array['select', 'insert', 'update']),
      ('quality_reviews',          array['select', 'insert']),
      ('publishing_records',       array['select', 'insert', 'update']),
      ('performance_metrics',      array['select', 'insert']),
      ('provider_usage',           array['select', 'insert'])
    ) as t(table_name, ops)
  loop
    execute format('alter table public.%I enable row level security', spec.table_name);
    execute format('revoke all on public.%I from authenticated', spec.table_name);

    foreach op in array spec.ops
    loop
      execute format('grant %s on public.%I to authenticated', op, spec.table_name);
      if op = 'select' or op = 'delete' then
        execute format(
          'create policy %I on public.%I for %s to authenticated using (user_id = (select auth.uid()))',
          spec.table_name || '_owner_' || op, spec.table_name, op
        );
      elsif op = 'insert' then
        execute format(
          'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
          spec.table_name || '_owner_insert', spec.table_name
        );
      elsif op = 'update' then
        execute format(
          'create policy %I on public.%I for update to authenticated '
          'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
          spec.table_name || '_owner_update', spec.table_name
        );
      end if;
    end loop;
  end loop;
end;
$$;

-- Create settings + default brand automatically for each new auth user, so the app never
-- has to handle a "no brand yet" state. SECURITY DEFINER with a fixed search_path.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.brand_profiles (user_id, name, is_default)
  values (new.id, 'My brand', true);

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
