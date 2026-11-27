-- Background jobs connect as service_role (bypasses RLS). Supabase normally grants service_role
-- full table privileges by default; this makes it explicit so jobs never fail with
-- 42501 "permission denied" because of a project whose default privileges differ.
-- The browser-facing roles (anon, authenticated) are unaffected.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
