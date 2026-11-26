# ContentOS — Implementation Plan

Status: **awaiting approval**. Based on `docs/ARCHITECTURE.md` and `docs/RECONNAISSANCE.md`.

## 0. Business framing (read first)

ContentOS is internal infrastructure. It does not generate revenue directly. The current
business priority is the first $1,000 in three weeks, which comes from prospecting,
conversations, discovery calls, audits and proposals. The full roadmap is 26–40 working days.
Building all of it now would push client acquisition back by more than a month.

So the plan is split into **slices**, each one usable on its own:

| Slice | Scope | Effort | Business value |
|---|---|---|---|
| **Slice 1 — Written factory** | Phase 0 + Phase 1 + LinkedIn/X writers + basic editorial review | ~6–8 working days | Turns one idea into LinkedIn post + X thread in your voice. Supports authority content today. |
| Slice 2 — Carousel | HTML carousel templates, slide editor, PNG/PDF export | ~3–5 days | Instagram/LinkedIn carousels without Canva work. |
| Slice 3 — Research | ScrapeCreators adapter, competitor reports, idea inbox feed | ~3–5 days | Content ideas from audience pain points. |
| Slice 4 — Video | Media worker, Whisper repurposing, Kokoro, Remotion | ~6–10 days | Saturday-challenge recordings → clips. |
| Slice 5 — Analytics + hardening | Metrics, experiments, cost dashboards | ~3–5 days | Feedback loop. |

Recommendation: build Slice 1 in time-boxed blocks **after** the daily prospecting block,
and stop there until there is a paying client. Document the build publicly — it doubles
as "build → debug → explain" proof-of-work content.

## 1. Target folder structure (refined)

Changes from the spec's §19 layout are marked ✱.

```
contentos/
├── AGENTS.md  CLAUDE.md  README.md  THIRD-PARTY-LICENSES.md
├── package.json  pnpm-workspace.yaml  tsconfig.base.json ✱
├── apps/
│   ├── web/                    Next.js App Router (UI + /api/v1 route handlers)
│   └── media-worker/           Node: Remotion, FFmpeg, Playwright carousel render
│       └── sidecars/ ✱         Python: whisper/, kokoro/ (HTTP, isolated processes)
├── packages/
│   ├── schemas/                Zod schemas: brief, slide, scene, review, API contracts
│   ├── database/               Supabase client, typed queries, generated types
│   ├── shared/                 errors, logging, ids, idempotency
│   ├── provider-gateway/       LLM/Image/Voice/Research interfaces, router, usage ledger, budgets
│   ├── brand-intelligence/     Brand DNA + knowledge retrieval (merged knowledge-engine) ✱
│   ├── idea-engine/
│   ├── content-strategy/       master brief
│   ├── content-generators/     platform writers
│   ├── editorial-engine/
│   ├── research-engine/
│   ├── carousel-engine/
│   ├── video-engine/           original + repurposing (merged media-engine) ✱
│   └── analytics-engine/
├── jobs/ ✱                     Trigger.dev task definitions (orchestrator)
├── agents/                     one folder per agent: prompt + schema + function
├── skills/                     SKILL.md files (brand-voice, linkedin-writing, …)
├── prompts/                    versioned prompt layers (system, generation, evaluation)
├── supabase/ ✱                 migrations/, seed.sql, config.toml (Supabase CLI convention)
├── tests/                      unit, integration, e2e, quality (eval set), fixtures
└── docs/
```

Rationale for merges: `knowledge-engine` and `brand-intelligence` share one data source;
`media-engine` and `video-engine` share one renderer. Fewer packages = less wiring for one
developer. `supabase/` replaces `database/` so the Supabase CLI works without config.

## 2. Phase 0 — Foundation (Slice 1)

Exit condition: you can log in, configure your brand and save ideas.

| # | Task | Acceptance check |
|---|---|---|
| 0.1 | pnpm workspace, strict TS, ESLint, Vitest, CI (typecheck + lint + test) | CI green on empty packages |
| 0.2 | Next.js app shell, Tailwind, brand tokens (Deep Night, Forest Teal, …), 7-area nav | Renders, responsive |
| 0.3 | Supabase migrations: core tables + fixes 1–12 from RECONNAISSANCE §4 | `supabase db reset` runs clean |
| 0.4 | RLS on every user-owned table + test that user B cannot read user A rows | RLS test passes |
| 0.5 | Supabase Auth (magic link, single owner allowlist via env) | Non-allowlisted email is rejected |
| 0.6 | Storage buckets (`uploads`, `renders`, `brand`) private, signed URLs only | Unsigned fetch returns 4xx |
| 0.7 | Brand profile CRUD + Brand DNA editor (voice, positioning, audience, banned phrases) | Saved and reloaded |
| 0.8 | Idea Inbox: quick capture, tags, status | Idea saved < 5 s from open |
| 0.9 | `/api/v1` conventions: Zod validation, structured error codes, request log, cursor pagination | Contract tests |

## 3. Phase 1 — Content intelligence (Slice 1)

Exit condition: an idea becomes an approved, immutable structured brief.

| # | Task |
|---|---|
| 1.1 | `provider-gateway`: `LLMProvider` interface, Claude adapter, OpenAI adapter, retry with backoff, usage ledger row per call, per-job/day/month budget check before each paid call |
| 1.2 | Prompt layering (system → Brand DNA → retrieved knowledge → skill → brief → platform → output schema) with `prompt_templates` versioning |
| 1.3 | Brand knowledge retrieval (pgvector embeddings, top-k) |
| 1.4 | Idea Analyst agent → `IdeaAnalysis` schema (argument, facts vs opinions, missing info) |
| 1.5 | Strategist agent → `MasterBrief` schema (spec §6) |
| 1.6 | Trigger.dev setup; `production_jobs` + `job_steps`; idempotency keys; `GET /jobs/:id` |
| 1.7 | Brief review UI, approve → immutable; edit after approval creates version n+1 |

## 4. Phase 3-lite — Writers + editorial (Slice 1)

| # | Task |
|---|---|
| 3.1 | LinkedIn writer + X/thread writer, run in parallel per brief |
| 3.2 | `content_versions` with per-section revise endpoint (`POST /assets/:id/revise`) |
| 4.1 | Editorial reviewer (separate model call): 6 weighted dimensions + mandatory gates (fabricated stats, invented stories, unsupported claims) |
| 4.2 | Exact + normalised phrase repetition check against your previous posts (embeddings later) |
| 4.3 | Accept/reject per suggestion; human approval; export (copy / markdown) |
| 4.4 | Eval set: 30 fixtures of your strong posts + generic AI posts; score report saved per prompt version |

**Slice 1 end-to-end test:** input "AI doesn't fix broken business processes. It makes them
faster." → analysis → brief → approve → LinkedIn post + X thread → independent reviews →
revise one paragraph → approve → export, with every call's cost visible on the project.

## 5. Later slices (summary)

- **Slice 2 (Phase 5):** 5 HTML carousel templates, slide JSON schema, single-slide revise,
  Playwright render to 1080×1350 PNG + PDF + ZIP, readability gate (min font size, contrast).
- **Slice 3 (Phase 2):** `ScrapeCreatorsResearchProvider`, competitor CRUD, baseline-relative
  outliers (needs ≥ N posts, else labelled "insufficient baseline"), comment mining,
  weekly schedule default, report → idea inbox. Agent-Reach optional, no-login channels only.
- **Slice 4 (Phase 6):** media worker container + whisper/kokoro sidecars, upload validation
  (magic bytes, size/duration limits), repurposing with spec rubric, original video pipeline
  via scene JSON → Remotion, MP4 + SRT export, resumable steps.
- **Slice 5 (Phase 7):** calendar, publishing records, metric snapshots, cost dashboard.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Building replaces selling | Slice gating; time-box; stop after Slice 1 until a client signs |
| Generated content sounds generic | Eval set before every prompt/model change; mandatory human approval |
| LinkedIn account restriction from scraping | No logged-in scraping; ScrapeCreators only |
| Cost overrun | Budget check is in the gateway, not the caller; hard stop + preserve work |
| Video pipeline consumes the timeline | Video is Slice 4, explicitly after text is proven useful |
| Prompt injection via research content | Research text passed only as quoted data fields; agents have no tools beyond their schema |

## 7. Decisions needed from you before Phase 0 code

1. Approve Slice 1 scope (or the full roadmap).
2. Create a Supabase project and a Vercel project, and add keys as platform secrets (not in chat).
3. Owner email for the auth allowlist (set as an env var, not committed).
4. 15–30 of your best existing LinkedIn posts for the Brand DNA examples and the eval set.
