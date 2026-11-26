# ContentOS — Architecture (frozen decisions)

Condensed from "ContentOS — Final Architecture & Implementation Specification".
Amendments from reconnaissance are marked **[R]** and explained in `RECONNAISSANCE.md`.

## 1. Product

A personal content production operating system with two production paths:

- **Idea-to-content:** idea / opinion / observation / research topic → original content.
- **Media-to-content:** existing video, audio or article → multiple assets.

Plus an independent research workflow (competitors, audience conversations) that feeds the
idea inbox.

**Principle:** one central intelligence system, multiple specialised pipelines, one content library.

## 2. Frozen decisions

| Decision | Choice |
|---|---|
| User model | Single-owner personal studio, multi-brand-ready data model |
| Architecture | Modular monolith |
| Web | Next.js + TypeScript on Vercel; REST under `/api/v1`, Zod-validated |
| Data | Supabase Postgres + Auth + Storage, RLS on all user-owned tables, pgvector **[R]** |
| Orchestration | Trigger.dev is the only orchestrator; job + step state of record in Postgres **[R]** |
| Media | Docker media worker (Node: Remotion, FFmpeg, Playwright) + Python sidecars (faster-whisper, Kokoro) **[R]** |
| LLMs | Claude + OpenAI behind `LLMProvider`; separate evaluator call for review |
| Research | ScrapeCreators primary; Agent-Reach optional, no logged-in channels **[R]** |
| Voice | Kokoro sidecar behind `VoiceProvider`, hosted fallback |
| Images | Hosted API behind `ImageProvider`; FLUX.2 Klein 4B is the only allowed FLUX variant |
| Carousels | Slide JSON → HTML/CSS templates → Playwright → PNG/PDF/ZIP (no image model for text) |
| Publishing | Manual approval and export only |
| Cost | Central AI Usage Controller; per-project, daily and monthly budgets enforced in the gateway |

Never run FFmpeg, transcription or GPU work in Vercel functions. Web requests create jobs and
return `202` with a job ID.

## 3. Provider interfaces

```ts
export interface LLMProvider {
  id: string;
  generate<T>(input: LLMInput, schema: ZodType<T>): Promise<LLMResult<T>>;
}
export interface ImageProvider {
  id: string;
  generate(input: ImageGenerationInput): Promise<GeneratedImage[]>;
  edit?(input: ImageEditInput): Promise<GeneratedImage[]>;
  estimateCost?(input: ImageGenerationInput): Promise<CostEstimate>;
}
export interface VoiceProvider {
  id: string;
  synthesize(input: VoiceInput): Promise<AudioAsset>;
}
export interface ResearchProvider {
  id: string;
  search(input: ResearchInput): Promise<ResearchResult[]>;
}
export interface VideoProcessor {
  id: string;
  transcribe(input: VideoInput): Promise<Transcript>;
  extractHighlights(input: HighlightInput): Promise<VideoClip[]>;
  render(input: RenderInput): Promise<RenderedVideo>;
}
```

Every call passes through the gateway, which: checks budget → routes to provider (fallback if
configured) → retries with backoff → writes a `provider_usage` row (provider, model, tokens,
estimated/actual cost, project, job, step, prompt template version, duration, retries).

## 4. Data model

Entities: brand_profiles, brand_knowledge, content_ideas, competitors, research_sources,
research_reports, research_report_sources **[R]**, content_projects, content_briefs,
content_assets, content_versions, carousel_slides, media_assets, production_jobs,
job_steps **[R]**, quality_reviews, publishing_records, performance_metrics,
prompt_templates, provider_usage, monitoring_schedules, content_embeddings **[R]**.

Rules:
1. UUID PKs; `user_id` on every user-owned row **[R]**; `brand_id` where applicable.
2. `created_at`, `updated_at` (trigger-maintained), `deleted_at` where soft delete is needed.
3. JSONB only for non-queried extensible attributes.
4. One approved version per asset (partial unique index).
5. Approved briefs immutable (trigger); changes create a new version.
6. Every generation traceable to prompt template version and model.
7. Performance metrics are insert-only dated snapshots.
8. Source evidence is never deleted when drafts change.

## 5. Agents

Each agent is a bounded, typed function returning Zod-validated output, invoked by a
Trigger.dev task. No agent can publish, spend beyond budget, or change brand configuration.

| Agent | MVP | Approval gate |
|---|---|---|
| Research | Yes | Before saving monitoring rules |
| Idea Analyst | Yes | — |
| Content Strategist | Yes | Brief approval before production |
| Platform Writers (LinkedIn, X, carousel, video script) | Yes, parallel | Before publishing |
| Visual Director | Yes | Before expensive media generation (configurable) |
| Media Producer | Yes, background | Before final approval |
| Editorial Reviewer | Yes | Human makes final decision |
| Performance Analyst | Phase 2 | — |

Prompt layering: global system → Brand DNA → retrieved knowledge → skill → brief →
platform constraints → output schema.

## 6. Workflows

- **A. Idea → assets:** analyse → retrieve Brand DNA → gaps → master brief → approve →
  generate formats in parallel → editorial QA → revise failures (max 2 loops) → human approval → export.
- **B. Competitor intelligence:** add competitor → schedule (weekly default) → collect →
  normalise → baseline-relative outliers → comment mining → report → ideas to inbox.
- **C. Original video:** brief → script → storyboard → approve → scenes/images → narration →
  captions → timeline → render → inspect → approve → export.
- **D. Repurposing:** upload → validate file + rights → extract audio → transcribe →
  candidate highlights → rank (clarity 25, insight 25, opening 20, relevance 15,
  completeness 10, AV quality 5) → boundaries → vertical crop → captions → render chosen clips.
- **E. Scheduled research:** due tasks → jobs → collect → dedupe → store → report → notify only on significant change.

## 7. Editorial Intelligence Engine

Weighted score: originality 20, specificity 20, brand voice 20, clarity 15, audience 15, platform 10.
Mandatory gates (block approval regardless of score): fabricated statistics, invented customer
stories, unsupported factual claims, improper reproduction of source material, contradiction of
brand position, broken video/missing audio, unreadable slides.
Originality: exact + normalised phrase match, embeddings, repeated hook/structure detection —
similarity flags for human review, never auto-reject.
Eval suite of 30–50 fixtures must be run before any prompt or model change.

## 8. Security

- Single-owner Supabase Auth with email allowlist; server-side authorisation on every write.
- Private storage, signed URLs, randomised object names.
- Keys only in platform secrets; never in frontend, DB, commits or agent context.
- All external content is untrusted data; agents get allowlisted tools only; SSRF checks on URLs.
- Uploads: magic-byte MIME check, size/duration limits, isolated processing, timeouts, temp cleanup.
- Explicit human approval: publishing, messaging, spend over budget, brand profile changes,
  deleting source media, overwriting approved assets.

## 9. Budgets (initial, configurable)

Text project $0.50 · media project $3.00 · daily $5.00 · monthly $50.00.
On reaching a limit: stop paid calls, keep completed work, report remaining steps, offer cheaper
alternatives, allow approval of additional spend.

## 10. Out of scope for first implementation

Multi-user SaaS/billing, auto-posting, autonomous comments/DMs, VTuber, model training or
fine-tuning, fully generated cinematic video, multi-agent frameworks.
