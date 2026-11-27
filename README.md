# ContentOS

Personal AI content research, strategy, production and editing studio for Rose Njeru Automation.

**Status:** Phases 0 and 1 complete and live. Phase 2 (Research) accepted ([report](docs/PHASE-2-REPORT.md)); Phase 3 (Multi-format writing) built ([report](docs/PHASE-3-REPORT.md)); Phase 4 (Editorial intelligence) built ([report](docs/PHASE-4-REPORT.md)); Phase 5 (Visual and carousel) built, awaiting the exit check ([report](docs/PHASE-5-REPORT.md));
background jobs run inline on Vercel (Plan B). See [Phase 0 report](docs/PHASE-0-REPORT.md) and
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
packages/intelligence/ prompt layers, Idea Analyst, Content Strategist, research labeller and gap synthesiser
packages/research-engine/  ScrapeCreators client, response normaliser, outlier and gap scoring
jobs/                  pipelines (idea analysis, brief, research sweep), inline runner, Trigger.dev tasks
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

## Background jobs — Phase 1 (Plan B: inline on Vercel)

Jobs run inside the web app after each request returns. Add these to Vercel → Settings →
Environment Variables (Production). Never paste them into chat or commit them.

| Secret | Value |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → secret key |

Then apply `supabase/migrations/20261127000100_content_intelligence.sql` in the Supabase SQL
Editor and redeploy Vercel.

Trigger.dev remains supported: set `JOB_RUNNER=trigger` and `TRIGGER_SECRET_KEY` in Vercel, put the
two secrets above plus `SUPABASE_URL` in Trigger.dev, and run the **Deploy background jobs** workflow
(needs GitHub secrets `TRIGGER_ACCESS_TOKEN` and `TRIGGER_PROJECT_REF`).

## Research — Phase 2

Add to Vercel → Settings → Environment Variables (Production), then redeploy:

| Secret | Value |
|---|---|
| `SCRAPECREATORS_API_KEY` | ScrapeCreators dashboard → API key. Server-side only. |
| `CRON_SECRET` | Any long random string. Vercel Cron sends it to `/api/v1/cron/research`. |

Apply `supabase/migrations/20261128000100_research.sql` in the Supabase SQL Editor. Then, in the
app: Research → Keywords → **Import starter keywords**; Research → Competitors → **Import
watchlist**; Research → **Run sweep**. The weekly sweep (`apps/web/vercel.json`, Mondays 05:17 UTC)
only runs after you turn it on, which records your approval.

## Writing — Phase 3

Apply `supabase/migrations/20261129000100_writing.sql`, then `20261129000200_brief_marks_idea.sql` and `20261129000300_tofu_mix.sql`, in the Supabase SQL Editor. No new secrets.

## Editorial — Phase 4

Apply `supabase/migrations/20261130000100_editorial.sql` in the Supabase SQL Editor.
To run the editorial eval, add the repository secret `ANTHROPIC_API_KEY` (GitHub → Settings →
Secrets and variables → Actions), then run **Actions → Editorial eval → Run workflow**. Add your
strongest posts as `.md` files in `evals/editorial/owner-posts/` first; the report is attached to
the run.

## Carousel design — Phase 5

Apply `supabase/migrations/20261201000100_visual.sql` in the Supabase SQL Editor. Exports use the
existing `SUPABASE_SERVICE_ROLE_KEY` (server-side) to write to the private `renders` bucket. No
new secrets.

## Vercel

Set the project's root directory to `apps/web`. Vercel detects pnpm workspaces and installs from
the repo root.
