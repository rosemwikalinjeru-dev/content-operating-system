# ContentOS

Personal AI content research, strategy, production and editing studio for Rose Njeru Automation.

**Status:** Phase 0 complete and live. Phase 1 (Content intelligence) implemented and tested;
awaiting deployment of background jobs. See [Phase 0 report](docs/PHASE-0-REPORT.md) and
[Phase 1 report](docs/PHASE-1-REPORT.md).

- [Architecture](docs/ARCHITECTURE.md) · [Reconnaissance](docs/RECONNAISSANCE.md) ·
  [Implementation plan](docs/IMPLEMENTATION-PLAN.md) · [API contracts](docs/API-CONTRACTS.md) ·
  [Third-party licences](THIRD-PARTY-LICENSES.md)
- Agent instructions: [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md)

## Repository layout

```
apps/web/              Next.js 16 app: studio UI + /api/v1 route handlers
packages/schemas/      Zod schemas shared by API, UI and (later) agents
packages/shared/       errors, structured logger, cursor pagination, owner allowlist
packages/database/     repositories over a user-scoped Supabase client (RLS always applies);
                       `/service` entry for workers only (service role, explicit user filters)
packages/provider-gateway/  AI providers, model routing, pricing, budget-enforcing usage controller
packages/intelligence/ prompt layers, Idea Analyst and Content Strategist agents, voice samples
jobs/                  Trigger.dev tasks (idea analysis, brief generation)
supabase/migrations/   schema, RLS, storage policies
tests/db/              migration + RLS tests against a real Postgres
```

## Local development

Requirements: Node 22+, pnpm 10, Postgres 15+ binaries (only for the database tests).

```bash
pnpm install
```

```bash
pnpm test
```

`pnpm test` runs the unit tests and the database tests. The database tests start a temporary
Postgres cluster from `/usr/lib/postgresql/16/bin` (override with `PG_BIN`), or use
`TEST_DATABASE_URL` if set (superuser connection to a throwaway database).

```bash
pnpm typecheck
```

```bash
pnpm lint
```

## Connecting Supabase (one-time)

1. Create a Supabase project (Postgres 15 or newer).
2. Apply the migrations with the Supabase CLI from the repo root:

   ```bash
   supabase link --project-ref <your-project-ref>
   ```

   ```bash
   supabase db push
   ```

3. In Supabase → Authentication:
   - Enable the Email provider (magic link).
   - Set **Site URL** to your app URL and add `<app-url>/auth/callback` to the redirect allowlist.
     The app URL is the `https://<name>.vercel.app` domain shown under Domains in Vercel, **not**
     the `vercel.com/<team>/<project>` dashboard address.
   - After your first sign-in, **disable new sign-ups**. The app allowlist already blocks other
     emails; this closes the door at the Auth level too.
4. Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in the values for local runs.
   On Vercel, set the same variables in Project Settings → Environment Variables:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SITE_URL`,
   `OWNER_EMAILS`.
5. Run the app:

   ```bash
   pnpm dev
   ```

The service-role key is **not** used by the web app in Phase 0. Do not add it to Vercel until a
phase needs it (Phase 1 background jobs run in Trigger.dev, which holds its own secrets).

## Background jobs (Trigger.dev) — Phase 1

Secrets and where they go. Never paste them into chat or commit them.

| Secret | Where | Value |
|---|---|---|
| `ANTHROPIC_API_KEY` | Trigger.dev → Environment Variables → Production | console.anthropic.com → API Keys |
| `SUPABASE_URL` | Trigger.dev → Environment Variables → Production | same as `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Trigger.dev → Environment Variables → Production | Supabase → Project Settings → API Keys → secret key |
| `TRIGGER_SECRET_KEY` | Vercel → Environment Variables | Trigger.dev → API keys → Production (`tr_prod_…`) |
| `TRIGGER_ACCESS_TOKEN` | GitHub → Settings → Secrets and variables → Actions | Trigger.dev → Account → Personal access tokens |
| `TRIGGER_PROJECT_REF` | GitHub → Actions secrets | Trigger.dev → Project settings (`proj_…`) |

Then:

1. Apply the new migration in Supabase (SQL Editor): `supabase/migrations/20261127000100_content_intelligence.sql`.
2. Run the **Deploy background jobs** workflow (GitHub → Actions), or push a change under `jobs/`.
3. Redeploy Vercel so it picks up `TRIGGER_SECRET_KEY`.

## Vercel

Set the project's root directory to `apps/web`. Vercel detects pnpm workspaces and installs from
the repo root.
