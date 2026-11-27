# Phase 1 — Content Intelligence: Report

Date: 2026-11-27
Exit condition: *"An idea becomes an approved structured brief"*, with every AI call costed.
Status: **implemented and tested locally; background jobs switched to the inline runner (Plan B); live demonstration pending Vercel secrets.**

## 0. Plan B (2026-11-27)

Trigger.dev built and uploaded the job bundle successfully but refused to create the deployment:
"Deployments are not available for this organization" (same result with CLI 4.8.4 and 4.8.5). This
is an account-level restriction. With the owner's approval, jobs now run inline on Vercel via
`after()` — see ARCHITECTURE.md "Plan B". The pipelines did not change; only the runner did.
Added: `jobs/src/runner.ts` (retries + backoff), stale-job recovery (`TIMED_OUT` after 6 minutes
without progress), `failJobIfActive`, runner selection via `JOB_RUNNER`. Tests: 119 passing.
Client bundles were checked: no worker code or secret names are present.

## 1. What was built

| Area | Files |
|---|---|
| Migration | `supabase/migrations/20261127000100_content_intelligence.sql` — knowledge full-text search, `knowledge_is_usable`, `search_brand_knowledge`, `ai_spend`, atomic `approve_brief`, idea analysis bookkeeping, brief→job link |
| AI gateway | `packages/provider-gateway` — `LLMProvider` interface, Claude adapter, pricing, task routing, `UsageController` (budgets + ledger) |
| Intelligence | `packages/intelligence` — layered prompts, Idea Analyst, Content Strategist, owner voice samples |
| Schemas | `packages/schemas/src/intelligence.ts` — `IdeaAnalysis`, `MasterBrief`, knowledge, settings, job views |
| Data access | `packages/database/src/{knowledge,production}.ts` (user-scoped, RLS); `service.ts` (workers only) |
| Background jobs | `jobs/` — Trigger.dev tasks `analyze-idea`, `generate-brief`; pure pipelines in `pipeline.ts` |
| API | ideas/:id/analyze, projects, projects/:id/brief, briefs/:id/approve|reject, jobs/:id, knowledge (+ voice-sample import), settings, usage |
| UI | Idea detail (analyse, create project + brief), Production Studio (versions, approve/reject/regenerate with guidance), Settings tabs: Knowledge base, Budgets & usage; live job progress |
| Deployment | `.github/workflows/deploy-jobs.yml`, `jobs/.env.example`, README secrets table |

## 2. Architecture decisions

1. **One path to the model.** Every AI call goes through `UsageController.generate`, which checks
   job, project, daily and monthly budgets *before* the call and writes a ledger row for every
   attempt (success, error, or blocked). There is no other provider entry point.
2. **Model routing.** Owner decision (2026-11-27): all tasks default to **Claude Sonnet 5.5** (half
   the price of Opus 5.5) to protect credits; depth is set with effort (analysis `medium`, brief
   `high`). The owner can assign Opus 5.5, Sonnet 5.5 or Haiku 5.5 per task in Settings → Budgets &
   usage. Server-side refusal fallbacks are sent only for models that support them (not Haiku 5.5). The routing table is the single place to move a task to a cheaper
   model; that decision should be measured against the editorial eval set first.
3. **Structured output.** `beta.messages.parse` with Zod output formats; responses are validated
   again with Zod. One automatic retry on schema-invalid output; refusals, auth and bad requests
   are never retried. Server-side refusal fallbacks are enabled, and cost is computed at the model
   that actually served the response.
4. **Prompt layers.** System prompt = global rules → Brand DNA → voice examples → skill. It is
   deterministic per brand, so it is prompt-cached. The idea, retrieved knowledge and analysis go
   in the user message inside `<data>` tags that cannot be closed from inside (prompt-injection
   defence). Owner guidance is passed as an instruction, not data.
5. **Knowledge retrieval** uses Postgres full-text search (approved deviation; embeddings arrive in
   Phase 4). Facts, stories and experiences are excluded unless verified — enforced in the database
   function, not only the UI.
6. **Traceability.** Prompt templates are versioned and hashed into `prompt_templates`; a template
   whose text changes without a version bump fails loudly. Briefs store model, template, input hash
   and job.
7. **Never pay twice.** Analysis jobs are keyed by idea text (re-clicking Analyse on an unchanged idea
   returns the same job). Job steps store an input hash; a retried run reuses a completed step.
   Generation endpoints accept `Idempotency-Key`; double submits collapse into one job.
8. **Workers use the service role** through a separate `@contentos/database/service` entry with
   explicit user filters; retrieved knowledge is re-checked for ownership. The web app never holds
   the service key.
9. **Supply-chain fix found during the build:** two copies of the Supabase client were installed
   because of differing optional OpenTelemetry peers, breaking types across packages. Fixed by a
   workspace-wide `@opentelemetry/api` override and by moving client construction into the database
   package.

## 3. Tests — actual results (2026-11-27)

```
pnpm typecheck → 0 errors (shared, schemas, database, provider-gateway, intelligence, jobs, web)
pnpm lint      → 0 problems
pnpm test      → 12 files, 113 tests passed
  db:   schema 24, intelligence 6 (search excludes unverified knowledge, cross-user isolation,
        hostile query text, spend aggregation, atomic approval, cross-user approval refused)
  unit: provider-gateway 16 (budgets at four scopes, ledger rows, retries, refusal/auth not
        retried, failed attempts costed, fallback-model costing, typed error mapping),
        intelligence 9 (layer order, determinism, injection wrapper, template hashing,
        voice samples identical to fixtures), jobs pipeline 9 (success, step reuse, input hash,
        budget stop, retry vs final failure, completed-job no-op, wrong job type, brief formats,
        invalid saved analysis ignored), web job queue 6, plus Phase 0 suites
pnpm build     → Next.js production build succeeded
esbuild bundle of jobs/src/tasks → succeeded, 0 warnings
```

Visual check: analysis and brief views rendered with sample data at 1000px and 390px (no
horizontal scroll). Screens behind login were not exercised against a live backend.

## 4. Security

- Anthropic, Supabase service and Trigger.dev secrets live only in Trigger.dev, Vercel and GitHub
  secrets; worker env is validated at start with variable names (never values) in errors.
- External text is wrapped as data; agents have no tools; outputs are schema-constrained.
- Budget changes and brief approvals happen only through owner actions.
- Unverified facts, stories and experiences cannot reach a prompt.

## 5. Cost

Estimated per call at Opus 5.5 list prices ($4 / $20 per MTok), before caching: idea analysis
≈ $0.03–0.08, master brief ≈ $0.08–0.20. Defaults: $0.50 per text project, $5/day, $50/month.
Actual costs are recorded per call on the Usage page.

## 6. Known limitations

1. **Not yet demonstrated live.** Needs: migration applied, `ANTHROPIC_API_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` in Vercel. No real model call has been made from this environment.
2. Inline jobs must finish within the Vercel function limit (`maxDuration = 300`). If the plan's
   limit is lower, long briefs can time out; they are then marked `TIMED_OUT` and can be retried.
3. Day/month budgets use UTC (Nairobi is UTC+3).
4. Learned rules from the owner's edits (LangChain social-agent pattern) are scheduled for Phases 3–4.

## 7. Exit-condition demonstration (to run once deployed)

1. Settings → Knowledge base → Import voice samples.
2. Idea Inbox → open an idea → Analyse idea → analysis appears, cost recorded.
3. Create project and brief → brief v1 appears → Approve → locked.
4. Generate a new version with guidance → v2 pending; approving v2 supersedes v1.
5. Budgets & usage shows each call with tokens and cost; set the daily budget to $0.01 and confirm
   the next analysis is blocked with a clear message.
