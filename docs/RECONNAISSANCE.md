# ContentOS — Repository Reconnaissance

Date: 2026-11-26
Status: Phase "First task" of the implementation prompt. No application code has been written.

Method: each reference repository was shallow-cloned (default branch, depth 1) into a scratch
directory outside this repo and inspected for structure, language, dependencies and licensing.
Nothing from them has been copied into ContentOS.

## 1. Summary

| Repository | Language / stack | License (verified in repo) | Decision |
|---|---|---|---|
| ersinkoc/AI-Video-Factory | TypeScript, pnpm monorepo, Node ≥ 24, Remotion 4.0.539, Drizzle + Postgres, Vitest | MIT (repo). Remotion has its own licence (see §3) | **Reference + selective adaptation** of gateway/ledger/stage patterns |
| ScrapeCreators/social-media-research-skills | Markdown Agent Skills + one Python validator; calls the paid ScrapeCreators API | MIT | **Adapt methodology** into `skills/`; write our own typed TS client |
| Panniantong/Agent-Reach | Python ≥ 3.10 CLI, JSON output, pins `yt-dlp` | MIT | **Defer / restrict** — see §2.3 (login-cookie channels) |
| SamurAIGPT (Anil-matcha)/AI-Youtube-Shorts-Generator | Python. Default mode = MuAPI (paid 3rd-party API); local mode = yt-dlp + faster-whisper + OpenCV + OpenAI/Gemini | MIT | **Adapt local mode** into the media worker |
| hexgrad/kokoro | Python, torch, transformers, `misaki[en]` (G2P) | Apache-2.0 | **Isolated TTS sidecar** behind `VoiceProvider` |
| black-forest-labs/flux2 | Python inference, torch 2.8, needs a GPU | Repo Apache-2.0; model licences vary per model | **Hosted API first**, self-host only Klein 4B later |

Not inspected in this pass (not cloned, links not supplied or reference-only): Short Video Factory
(AGPL-3.0 — reference only, do not read-and-reimplement closely), LangChain Social Agent,
Open Generative AI, Open-LLM-VTuber, MiniMax-H3-Image / H3-Tiny. These are deferred or
reference-only in the spec, so they do not block Phase 0–3.

## 2. Findings per repository

### 2.1 AI Video Factory — the most relevant reference

Structure: `apps/{cli,studio,worker}`, `packages/{agents,core,db,media-gateway,pipeline,storage,video}`.

What maps directly onto ContentOS:

| AVF component | ContentOS equivalent | Reuse approach |
|---|---|---|
| `packages/media-gateway` (`router.ts`, `registry.ts`, `ledger.ts`, `pricing.ts`, provider adapters for fal, ElevenLabs, Gemini, Whisper, ComfyUI) | `packages/provider-gateway` + AI Usage Controller | Re-implement the pattern: provider registry → router with fallback → cost ledger with cache. Small enough to rewrite cleanly against our schema. |
| `packages/pipeline` (stage progress, `render-audit.ts`, `youtube-shorts.ts`, `editing.ts`) | `packages/video-engine`, job steps | Study stage/resume model; ours lives in Trigger.dev tasks + `job_steps` table. |
| `packages/agents` (`review.ts`, `schemas.ts`, `runner.ts` with limits) | `agents/*`, editorial engine | Borrow the "score every shot ≥ 8/10, replan up to N rounds, then wait for human" gate. |
| `packages/video` (Remotion compositions, captions, transitions) | `apps/media-worker/renderers` | Adapt later (Phase 6). |

Cautions:
- Its Studio has **no login** and binds to localhost — none of its web/auth layer is reusable.
- It is large (64 style packs, ACP multi-model routing). Vendoring it would make ContentOS
  depend on its architecture. The spec's "reference implementation" decision is correct.
- It uses Drizzle directly against Postgres; we use Supabase. Schema ideas only.

### 2.2 Social Media Research Skills

13 skills: `outlier-post-finder`, `comment-mining`, `competitor-social-research`,
`transcript-intelligence`, `trend-discovery`, `audience-research`, `social-listening-brief`,
`content-repurposing`, `creator-profile-teardown`, `ad-library-teardown`,
`influencer-prospecting`, `product-demand-research`, `scrapecreators-api`.

- LinkedIn is covered by outlier, competitor, transcript, listening and repurposing skills.
- These are prompt workflows for a chat agent, not a library. ContentOS needs (a) a typed
  `ScrapeCreatorsResearchProvider` implementing `ResearchProvider`, and (b) our own
  `skills/competitor-research`, `skills/outlier-analysis`, `skills/audience-mining` that borrow
  the methodology (baseline-relative outliers, VOC extraction) with attribution.
- ScrapeCreators is usage-priced. Cost per call must go through the usage controller.

### 2.3 Agent-Reach — risk flag

Channels: web, YouTube, Reddit, GitHub, V2EX, Bilibili, Xiaohongshu, Xueqiu, Boss, and
**LinkedIn / X / Instagram / Facebook**. The LinkedIn channel authenticates with the
`li_at` login cookie, and the runtime includes browser-cookie reuse and CDP browser control.

This conflicts with two spec rules: "respect platform access restrictions" and "never claim
access to private content". Scraping LinkedIn with your own session cookie also puts **your
LinkedIn account** — your main client-acquisition channel — at risk of restriction.

Recommendation:
- Do not use Agent-Reach's logged-in channels.
- If used at all, call it as an isolated subprocess, allowlisted to no-login channels
  (web, YouTube, Reddit, GitHub), with output treated as untrusted data.
- Move it from Phase 2 core to Phase 2 optional. ScrapeCreators covers the MVP need.

### 2.4 AI YouTube Shorts Generator

Modules: `downloader`, `transcriber`, `highlights`, `clipper`, `pipeline`, plus `local/` variants.

- Default mode routes download/transcribe/crop through **MuAPI** (third-party paid service).
  Use only the `--mode local` path: `faster-whisper`, `ffmpeg`, OpenCV face-tracking crop.
- Highlight scoring is "virality"-weighted (hooks, emotional peaks, conflict). The spec's
  rubric deliberately weights standalone clarity and useful insight higher. Keep our rubric;
  reuse only the chunking-with-overlap and overlap-dedupe logic.
- `yt-dlp` should only be used on videos you own or have rights to (spec Workflow D step 2).

### 2.5 Kokoro

- Apache-2.0 code and weights. Python + torch. `misaki` G2P can fall back to `espeak-ng`
  (GPL-3.0). Running Kokoro as a **separate HTTP sidecar process** keeps the GPL component
  out of the proprietary TypeScript codebase. Record this in THIRD-PARTY-LICENSES.md.
- CPU inference is feasible for 60-second narrations; no GPU needed for MVP.

### 2.6 FLUX.2

- Confirmed in README: **Klein 4B and Klein 4B Base = Apache-2.0**. Klein 9B, 9B KV, 9B Base
  and FLUX.2 [dev] = **non-commercial** licences.
- Self-hosting needs a GPU (RTX 3090/4070 class for 4B). The spec says GPU only when justified.
  For MVP: carousel slides are HTML-rendered (no image model), and image assets go through a
  hosted API behind `ImageProvider`. Pin the provider-side model ID so a non-commercial
  variant is never selected by accident.

### 2.7 LangChain social-media-agent (inspected 2026-11-27)

TypeScript, LangGraph, MIT. Takes a URL → generates LinkedIn/X posts and threads, with a
human-in-the-loop interrupt to accept, edit or reject; optional Slack/GitHub ingestion, image
selection, and posting via Arcade.

Worth adapting (re-implemented on our stack, not imported):

- **Reflection → learned rules.** After the user edits a draft, a prompt compares original vs
  revised and decides whether to create a general rule ("no emojis", "shorter hooks"), then merges
  it into a ruleset applied to future posts. This is exactly the "learn from approved edits" loop
  planned for ContentOS; adopt it in Phase 3–4 with rules stored per brand and shown for approval.
- **URL → post repurposing** (`repurposer`, `ingest-data`): content ingestion pattern for
  Workflow D-text (article/URL → posts).
- **Verify nodes** (`verify-links`, `verify-tweet`): check a source is relevant before generating.
- **Condense / thread generation** prompts as references for X thread writing.

Not adopted: LangGraph server + LangSmith (second orchestrator alongside Trigger.dev), Arcade
auth and auto-posting (publishing stays manual by design), FireCrawl (extra paid scraper).

### 2.8 short-video-factory (YILS-LIN)

Electron desktop app for batch product/marketing short videos. **AGPL-3.0.** Not integrated and
not closely re-implemented. Using it as a separate desktop tool is fine; copying code is not.

### 2.9 Open-Generative-AI

Next.js/Electron front end over the paid MuAPI service (600+ models), marketed as "no content
filters". MIT app code. Reference only for provider/model catalogue ideas; not integrated —
it routes through a third-party reseller and its positioning conflicts with brand trust rules.

### 2.10 Open-LLM-VTuber

Python, MIT, but bundled Live2D sample models carry the Live2D Free Material License: collaboration
characters are non-commercial; commercial use is limited to small-scale enterprises (< ¥10M sales).
Deferred. If an avatar is wanted later, commission an original Live2D model.

### 2.11 MiniMax-H3-Image

MiniMax-H3-Image Community License (released 2026-11-10). Restrictions:
- **Excluded territories: EU, UK, South Korea, USA.** Use of the model *or its outputs* outside the
  applicable territory is not licensed. Kenya is inside, but published content reaches US/EU/UK
  audiences, so publishing outputs is a real legal risk.
- Commercial products must display "MiniMax-H3-Image" in the UI.
- Outputs may not be used to improve any other AI model.
Decision: **do not use for published content** without legal review.

### 2.12 MiniMax-H3-Tiny (fuyi25)

Unofficial pruned/distilled derivative of the MiniMax H3 reference-to-video model; 14–17B
parameters, needs a large GPU and the official H3 checkpoint. Weights fall under the MiniMax H3
Community License (same territory restrictions). Code Apache-2.0. Deferred.

### 2.13 ScrapeCreators — LinkedIn coverage gap

The API lists a LinkedIn **company** posts feed and single-post lookup, and a person **profile**
lookup, but no person posts feed. Competitor tracking of individual LinkedIn creators may be
limited; TikTok, Instagram, YouTube, X, Threads and Facebook have full feeds. Verify with a live
call at the start of Phase 2 before promising LinkedIn creator benchmarks.

## 2A. Integration map

| Repository | Where it lands | How |
|---|---|---|
| Social Media Research Skills | Phase 2 research engine | Adapt the 13 skill methodologies (outliers vs baseline, comment mining, competitor and creator teardowns, transcript intelligence, trends) into `skills/` + typed ScrapeCreators client |
| LangChain social-media-agent | Phases 3–4 | Learned rules from edits, URL repurposing, verify-before-generate, accept/edit/reject flow |
| Agent-Reach | Phase 2 (optional) | No-login channels only: Reddit, YouTube, web — audience questions and objections |
| AI Video Factory | Phase 6 | Scene planning, style packs (including anime/illustrated styles), approvals, cost ledger, Remotion composition |
| AI YouTube Shorts Generator | Phase 6 | Local mode: faster-whisper, chunked highlight detection, OpenCV vertical crop |
| Kokoro | Phase 6 | Voiceover sidecar for all videos, including anime-style YouTube videos |
| FLUX.2 Klein 4B | Phases 5–6 | Image provider (scenes, anime-style frames, thumbnails) |
| short-video-factory | — | AGPL; standalone tool only |
| Open-Generative-AI | — | Reference only |
| Open-LLM-VTuber | Deferred | Live2D licence limits |
| MiniMax-H3-Image | Not for published content | Territory licence |
| MiniMax-H3-Tiny | Deferred | Territory licence; GPU cost |

**Anime videos** are a combination, not one repo: Kokoro supplies the voice; FLUX.2 Klein 4B (or a
hosted image/video API) supplies consistent character frames; AI Video Factory's style-pack and
scene approach plus Remotion supplies motion and assembly.

## 3. Licensing issues not in the original spec

1. **Remotion is not MIT.** It uses the Remotion License: free for individuals and companies
   with up to 3 employees; larger companies need a company licence. Rose Njeru Automation
   qualifies today. Re-check if the team grows. Add to THIRD-PARTY-LICENSES.md.
2. **espeak-ng (GPL-3.0)** via Kokoro's G2P — handled by process isolation.
3. **yt-dlp (Unlicense)** is fine to use, but downloading platform content raises platform
   ToS questions separate from code licensing.
4. **Fonts**: Cormorant Garamond, DM Sans and Plus Jakarta Sans are all SIL OFL 1.1 — fine to
   embed in rendered PNG/PDF exports.

## 4. ERD validation — changes required before migrations

The foundation SQL in the spec is a good start. These gaps must be closed in Phase 0:

| # | Issue | Fix |
|---|---|---|
| 1 | `content_briefs`, `content_assets`, `quality_reviews`, `production_jobs` have no `user_id`, so RLS requires multi-table joins on every query | Add `user_id` to every user-owned table; RLS policy = `user_id = auth.uid()` everywhere |
| 2 | `content_versions` is in the ERD but not the migration; "only one current approved version" is not enforced | Add `content_versions(asset_id, version, body jsonb, status, prompt_template_id, model, …)` + partial unique index `where status = 'approved'` |
| 3 | Step-level job status is required but jobs only have `current_step` | Add `job_steps(job_id, name, status, attempt, input_hash, output_ref, cost)`; `input_hash` enables "never regenerate unchanged" |
| 4 | Traceability rule 4 (prompt template + model version) has no columns | `prompt_templates(id, name, version, body, hash)`; `provider_usage` references `prompt_template_id`, `model`, `job_id`, `step_id` |
| 5 | Research sources ↔ reports is many-to-many | Add `research_report_sources` join table |
| 6 | Duplicate source detection | Unique index on `(brand_id, content_hash)` |
| 7 | Originality engine needs semantic search | Enable `pgvector`; `content_embeddings(owner_type, owner_id, embedding vector(…))` |
| 8 | Performance snapshots | `performance_metrics(publishing_record_id, captured_at, …)` insert-only, unique on both |
| 9 | Status values as free text | Postgres enums or `check` constraints per status column |
| 10 | `updated_at` never updates | Shared `set_updated_at()` trigger |
| 11 | Brief immutability after approval | Trigger blocking `update` on approved `content_briefs` rows |
| 12 | Budget enforcement needs spend totals fast | `provider_usage` index on `(user_id, created_at)` and `(job_id)` |

## 5. Architecture observations

1. **One orchestrator.** AVF has its own stage runner; ContentOS uses Trigger.dev. Do not run
   both. Job/step state of record lives in Postgres; Trigger.dev drives execution and retries.
2. **The media worker is two runtimes.** Remotion/FFmpeg is Node; faster-whisper and Kokoro
   are Python. Recommended: one Node media-worker container plus Python sidecars
   (`whisper`, `kokoro`) on an internal network, each behind an HTTP interface. Nothing in
   Vercel touches FFmpeg.
3. **Agents ≠ framework.** Each "agent" is a typed function: `(input, context) → Zod-validated
   output`, called from Trigger.dev tasks. No multi-agent framework is needed for MVP.
4. **Carousel rendering** (HTML → Playwright → PNG/PDF) can run in the media worker, not Vercel.

## 6. External services and credentials required

| Service | Needed from | Purpose |
|---|---|---|
| Supabase project (URL, anon key, service-role key) | Phase 0 | DB, Auth, Storage |
| Vercel project | Phase 0 | Web deploy |
| Anthropic API key | Phase 1 | Reasoning / writing |
| OpenAI API key | Phase 1 (optional) | Fallback provider, embeddings |
| Trigger.dev project + secret key | Phase 1 | Background jobs |
| ScrapeCreators API key | Phase 2 | Social research |
| Container host (CPU, ≥ 4 GB RAM, disk) | Phase 5–6 | Media worker + sidecars |
| Hosted image API (e.g. BFL API or fal) | Phase 5 | Image assets |
| Hosted TTS (optional fallback) | Phase 6 | Voice fallback |

None of these should be entered into chat or committed. They belong in Vercel / Trigger.dev /
container-host secrets.
