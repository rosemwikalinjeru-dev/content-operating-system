# ContentOS — Implementation Plan

Status: **approved — full system (2026-11-26)**. Phase 0 complete (2026-11-26). Phase 1 complete (2026-11-27). Phase 2 accepted with refinement ongoing (2026-11-27). Phase 3 built (see PHASE-3-REPORT.md). Phase 4 brief proposed. Based on `docs/ARCHITECTURE.md` and `docs/RECONNAISSANCE.md`.

## 0. Scope

Scope: **the full ContentOS system**, Phases 0–7 as defined in the specification. Phases are
built in order, one at a time, and each phase must meet its exit condition (with real test
results) before the next begins.

| Phase | Scope | Estimate |
|---|---|---|
| 0 — Foundation | Workspace, schema, RLS, auth, storage, brand profile, idea inbox, API conventions | 2–3 days |
| 1 — Content intelligence | Provider gateway, usage controller, Brand DNA retrieval, idea analysis, master brief, Trigger.dev jobs | 3–4 days |
| 2 — Research intelligence | ScrapeCreators adapter, competitors, outliers, comment mining, schedules, reports | 3–5 days |
| 3 — Multi-format writing | LinkedIn, X/threads, carousel narrative, video script, versioning | 3–4 days |
| 4 — Editorial intelligence | Scoring, gates, originality, fact status, targeted revisions, eval suite | 3–4 days |
| 5 — Visual and carousel | Visual director, templates, slide editor, image provider, PNG/PDF/ZIP | 3–5 days |
| 6 — Video | Media worker, Whisper, Kokoro, original + repurposing pipelines, MP4/SRT | 6–10 days |
| 7 — Performance | Calendar, publishing records, metric snapshots, insights, cost dashboard | 3–5 days |

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

## 2. Phase 0 — Foundation

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

## 3. Phase 1 — Content intelligence

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

## 4. Phases 3–4 — Writers + editorial

| # | Task |
|---|---|
| 3.1 | LinkedIn writer + X/thread writer, run in parallel per brief |
| 3.2 | `content_versions` with per-section revise endpoint (`POST /assets/:id/revise`) |
| 4.1 | Editorial reviewer (separate model call): 6 weighted dimensions + mandatory gates (fabricated stats, invented stories, unsupported claims) |
| 4.2 | Exact + normalised phrase repetition check against your previous posts (embeddings later) |
| 4.3 | Accept/reject per suggestion; human approval; export (copy / markdown) |
| 4.4 | Eval set: 30 fixtures of your strong posts + generic AI posts; score report saved per prompt version |

**Written-content end-to-end test:** input "AI doesn't fix broken business processes. It makes them
faster." → analysis → brief → approve → LinkedIn post + X thread → independent reviews →
revise one paragraph → approve → export, with every call's cost visible on the project.

## 5. Remaining phases (summary)

- **Phase 5:** 5 HTML carousel templates, slide JSON schema, single-slide revise,
  Playwright render to 1080×1350 PNG + PDF + ZIP, readability gate (min font size, contrast).
- **Phase 2:** `ScrapeCreatorsResearchProvider`, competitor CRUD, baseline-relative
  outliers (needs ≥ N posts, else labelled "insufficient baseline"), comment mining,
  weekly schedule default, report → idea inbox. Agent-Reach optional, no-login channels only.
- **Phase 6:** media worker container + whisper/kokoro sidecars, upload validation
  (magic bytes, size/duration limits), repurposing with spec rubric, original video pipeline
  via scene JSON → Remotion, MP4 + SRT export, resumable steps.
- **Phase 7:** calendar, publishing records, metric snapshots, cost dashboard.

## 5A. Reference-repository adoption by phase (added 2026-11-27)

- **Phase 2:** ScrapeCreators skills adapted (outliers, comment mining, competitor/creator
  teardowns, transcripts, trends). First task: live-verify LinkedIn creator coverage.
  Agent-Reach optional for Reddit/YouTube/web.
- **Phase 2 additions from the owner's watchlist (docs/research/COMPETITOR-WATCHLIST.md):**
  competitors gain `relationship` (direct_competitor / positioning_benchmark / craft_benchmark),
  `priority` and `study_focus`; reports use the per-post analysis framework and the hook-pattern
  taxonomy; manual post import for LinkedIn individuals; outliers only with a sufficient baseline.
- **Phase 2 niche gap engine (owner requirement):** keyword/hashtag niche sweeps, niche-wide
  outliers vs each author's baseline, topic clustering, competitor coverage per topic, gap score
  (outlier strength × low coverage × brand fit), unanswered audience questions, and automatic
  research ideas in the Inbox with evidence and observed/interpretation separation. Exit check:
  one weekly sweep produces at least three evidence-backed gap ideas that pass the Idea Analyst.
- **Phases 3–4:** from the LangChain social-media-agent — learned rules from the owner's edits
  (proposed rules require approval before use), URL → post repurposing, verify-before-generate.
- **Phase 6:** AI Video Factory scene/style-pack approach (anime styles), Shorts generator local
  mode, Kokoro voice, FLUX.2 Klein 4B frames.

See RECONNAISSANCE §2A for the full map.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Generated content sounds generic | Eval set before every prompt/model change; mandatory human approval |
| LinkedIn account restriction from scraping | No logged-in scraping; ScrapeCreators only |
| Cost overrun | Budget check is in the gateway, not the caller; hard stop + preserve work |
| Video pipeline consumes the timeline | Video is Phase 6, after the text pipeline is proven |
| Prompt injection via research content | Research text passed only as quoted data fields; agents have no tools beyond their schema |

## 7. Decisions needed from you before Phase 0 code

1. ~~Approve scope~~ — approved: full system, 2026-11-26.
2. Create a Supabase project and a Vercel project, and add keys as platform secrets (not in chat).
3. Owner email for the auth allowlist (set as an env var, not committed).
4. 15–30 of your best existing LinkedIn posts for the Brand DNA examples and the eval set.
