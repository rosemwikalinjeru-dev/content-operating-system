# Phase 0 — Foundation: Report

Date: 2026-11-26
Exit condition: *"You can log in, configure your brand and save ideas."*
Status: **implemented and tested locally; end-to-end demonstration blocked on a Supabase project.**

## 1. Files created

| Area | Files |
|---|---|
| Workspace | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `vitest.config.ts`, `.nvmrc`, `.gitignore`, `.github/workflows/ci.yml` |
| Database | `supabase/migrations/20261126000100_foundation.sql`, `…000200_rls.sql`, `…000300_storage.sql` |
| Packages | `packages/shared` (errors, logger, cursor, allowlist), `packages/schemas` (common, brand, brand-defaults, idea), `packages/database` (client, brands, ideas) |
| Web app | `apps/web`: `proxy.ts`, `env.ts`, `lib/auth.ts`, `lib/supabase/server.ts`, `lib/api/handler.ts`, API routes (health, brands, ideas), login + auth callback + sign-out, studio shell with 8 nav areas, Dashboard, Idea Inbox, Brand DNA settings, placeholders for Research / Production / Library / Calendar / Analytics |
| Tests | `tests/db/*` (Supabase stub, ephemeral Postgres, 24 schema/RLS tests), unit tests in `packages/*/src/*.test.ts` and `apps/web/src/**/*.test.ts` |
| Docs | `README.md`, `docs/API-CONTRACTS.md`, this report |

## 2. Architecture decisions

1. **Whole schema in Phase 0.** All 22 tables from the ERD (except `content_embeddings`,
   which needs pgvector — Phase 1) are created now, with RLS, so later phases add behaviour
   rather than restructuring tables.
2. **Composite foreign keys `(parent_id, user_id)`** on every child → parent link. Postgres
   checks foreign keys without RLS, so a plain FK would let a user attach a row to another
   user's brand or project by guessing its UUID. A test proves the composite FK blocks it.
3. **Per-table operation grants**, not blanket CRUD: research sources, usage ledger,
   performance metrics and quality reviews are insert-only; briefs, versions and brands
   cannot be hard-deleted from the client.
4. **Immutability in the database**, not only the app: approved briefs (only
   approved → superseded allowed) and content-version bodies are protected by triggers.
5. **Signup trigger** creates `user_settings` (budget defaults $0.50 / $3 / $5 / $50) and a
   default brand, so the app never handles a "no brand" state.
6. **Owner allowlist checked three times:** before sending a magic link, in the auth
   callback, and on every page/API request. Fails closed if `OWNER_EMAILS` is empty.
7. **No service-role key in the web app.** All web reads/writes run as the user under RLS.
8. **Next.js 16 `proxy.ts`** refreshes the session; it is a convenience layer, and every
   handler re-validates.
9. **Dependency versions** pinned exactly, each released ≥ 2 weeks ago. TypeScript 5.9
   (not 7) and Vitest 3 chosen for ecosystem compatibility.

## 3. Database migrations

| Migration | Contents |
|---|---|
| `20261126000100_foundation.sql` | 22 tables, check constraints, partial unique indexes (one default brand, one approved brief, one approved version), immutability triggers, `updated_at` triggers, owner-namespaced storage paths |
| `20261126000200_rls.sql` | RLS + policies for all tables, anon revoked, signup provisioning trigger (`security definer`, empty `search_path`) |
| `20261126000300_storage.sql` | Private buckets `uploads`, `renders`, `brand` with MIME and size limits; owner-folder policies; renders writable only by the service role |

## 4. API contracts

See [API-CONTRACTS.md](API-CONTRACTS.md): health, brands (list/create/get/update), ideas
(list with cursor/filter/search, create, get, update, soft delete).

## 5. Tests — actual results

Run on 2026-11-26 in this environment (Node 22.23, Postgres 16 local cluster):

```
pnpm typecheck   → 4 packages, 0 errors
pnpm lint        → 0 problems
pnpm test        → 5 files, 59 tests passed, 0 failed
                   db:   tests/db/schema.test.ts        24 passed
                   unit: shared 11, schemas 9, api handler 8, ideas route 7
pnpm build       → Next.js production build succeeded (17 routes + proxy)
```

Smoke test of the production server (placeholder Supabase URL):

| Check | Result |
|---|---|
| `GET /api/v1/health` | 200, `x-request-id` and `X-Frame-Options: DENY` present |
| `GET /api/v1/ideas` without a session | 401 structured JSON error |
| `GET /` without a session | 307 → `/login` |
| Login with a non-allowlisted email | Generic "link is on its way" message, `login_rejected_not_allowlisted` logged, no email sent |
| Login page at 390 px and 1280 px | Renders correctly |

The tests were checked for false passes: with the select policy on `content_ideas` deliberately
replaced by `using (true)`, the isolation test failed as expected; restoring it brought all
24 back to passing.

Bug found and fixed during the phase: the pagination cursor normalised timestamps through
JavaScript `Date`, which drops Postgres microseconds. The next page would have silently
skipped ideas created within the same millisecond. The cursor now keeps the exact timestamp
string; a regression test covers it.

## 6. Security considerations

- RLS on every table, enforced and tested, including cross-tenant FK attempts and the anon role.
- No secrets in code; `.env*` ignored; env validated at startup with a clear error.
- `getUser()` (server-validated JWT) used for auth, never cookie contents alone.
- Magic-link responses do not reveal whether an email is allowed.
- Auth callback redirects only to a fixed internal path (no open redirect).
- Security headers: frame denial, nosniff, referrer policy, permissions policy, HSTS.
- API requires JSON bodies (blocks form-based CSRF); 256 KB body limit; user search text is
  LIKE-escaped and PostgREST-quoted.
- Logs redact keys matching token/secret/password/cookie/authorization/api key.
- **Action for you:** disable Supabase sign-ups after your first login (README step 3).

## 7. Cost implications

No AI calls in Phase 0, so AI spend is $0. Infrastructure: Supabase and Vercel free tiers are
enough for Phase 0–1.

## 8. Known limitations

1. **Exit condition not demonstrated end-to-end.** Login, saving Brand DNA and saving ideas
   need a real Supabase project. The database layer is tested against Postgres 16 with a
   Supabase stub (roles, `auth.uid()`, storage schema), not against Supabase itself.
   The studio pages behind login have only been verified by type-checking and the build.
2. **CI not yet observed green on GitHub.** The workflow runs DB tests on Postgres 17;
   locally they ran on 16.
3. PostgREST query strings (cursor and search filters) are covered by unit tests of the route
   layer, not executed against a live PostgREST.
4. Database types are hand-written; switch to `supabase gen types` once the project is linked.
5. `content_embeddings` (pgvector) is deferred to Phase 1.

## 9. Remaining to close Phase 0

1. You create the Supabase project, run `supabase db push`, configure Auth as in the README,
   and set the four environment variables (locally or on Vercel).
2. I then run the exit-condition check against it: sign in → edit Brand DNA → save an idea →
   confirm a second account cannot see it.
