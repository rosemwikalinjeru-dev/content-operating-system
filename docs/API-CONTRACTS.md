# API Contracts — `/api/v1`

Status: endpoints implemented in Phase 0. Later phases append to this file.

## Conventions

| Rule | Implementation |
|---|---|
| Auth | Supabase session cookie. Every handler calls `requireApiSession()`, which validates the JWT with Supabase Auth (`getUser`) and re-checks the owner allowlist. |
| Validation | Zod on body, query and path params (`apps/web/src/lib/api/handler.ts`). Unknown fields are stripped; `user_id` is never accepted from the client. |
| Body | `Content-Type: application/json` required for bodies; max 256 KB. JSON-only bodies also block cross-site form CSRF (browsers cannot send JSON cross-origin without a CORS preflight, which the API does not allow). |
| Pagination | Keyset cursor over `(created_at desc, id desc)`. Response `{ data, next_cursor }`; pass `cursor` back to continue. Cursors are opaque. |
| Errors | `{"error": {"code", "message", "request_id", "details?"}}`. `details` only for `VALIDATION_FAILED`. Internal messages are never returned. |
| Headers | Every response has `x-request-id` and `cache-control: no-store`. |
| Logging | One JSON log line per request: method, path, status, duration, request id. No bodies, no headers. |
| Background work | From Phase 1: `202 Accepted` + `job_id`, with `Idempotency-Key` header. |

### Error codes

| Code | HTTP |
|---|---|
| `VALIDATION_FAILED` | 400 |
| `UNAUTHORIZED` | 401 |
| `BUDGET_EXCEEDED` | 402 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 (also for ids that exist but belong to someone else) |
| `CONFLICT` | 409 (duplicates, immutable records) |
| `PAYLOAD_TOO_LARGE` | 413 |
| `RATE_LIMITED` | 429 |
| `INTERNAL` | 500 |
| `PROVIDER_ERROR` | 502 |
| `SERVICE_UNAVAILABLE` | 503 |

## Endpoints

### `GET /api/v1/health`
Unauthenticated. `200 {"status":"ok"}`.

### `GET /api/v1/brands`
`200 {"data": BrandProfile[]}` — default brand first.

### `POST /api/v1/brands`
Body: `BrandProfileCreate` (`name` required; `positioning`, `audience`, `voice_profile`,
`brand_guidelines` optional). `201 BrandProfile`.

### `GET /api/v1/brands/:id` · `PATCH /api/v1/brands/:id`
PATCH body: any subset of `BrandProfileCreate` plus `status: "active" | "archived"`; at least one
field. `200 BrandProfile`. Brand changes only happen through this owner-initiated call.

### `GET /api/v1/ideas`
Query: `limit` (1–100, default 25), `cursor`, `brand_id`, `status`
(`inbox|developing|briefed|archived`; default excludes archived), `tag`, `q` (title/body search,
literal match). `200 {"data": Idea[], "next_cursor": string | null}`.

### `POST /api/v1/ideas`
Body: `{ "raw_input": string (1–20000), "title"?: string, "tags"?: string[] (≤20), "brand_id"?: uuid }`.
Without `title`, the first line of `raw_input` is used. Without `brand_id`, the default brand.
`201 Idea`.

### `GET /api/v1/ideas/:id` · `PATCH /api/v1/ideas/:id` · `DELETE /api/v1/ideas/:id`
PATCH body: any of `title`, `raw_input`, `tags`, `status`. DELETE is a soft delete → `204`.

## Phase 1 endpoints

Background work returns `202 Accepted` with `{ "job_id", "status", "created" }`; a duplicate
request returns `200` with the existing job (`created: false`). Generation endpoints accept an
`Idempotency-Key` header (8–128 chars of `A-Za-z0-9_:.-`); the UI sends a fresh one per click.

### `POST /api/v1/ideas/:id/analyze[?force=1]`
Starts idea analysis. Without `force`, the key is derived from the idea text, so analysing an
unchanged idea again returns the same job at no cost. `force=1` runs a new analysis.

### `POST /api/v1/projects`
Body: `{ "idea_id": uuid, "title"?: string, "formats"?: ("linkedin"|"x_thread"|"carousel"|"short_video")[] }`
(default `["linkedin","x_thread"]`). `201` project. Moves the idea from `inbox` to `developing`.

### `GET /api/v1/projects` · `GET /api/v1/projects/:id`
Projects with their brief versions (newest first).

### `POST /api/v1/projects/:id/brief`
Body: `{ "guidance"?: string (≤2000) }` — the owner's steer for this version. `202` job. Each run
creates a new **pending** brief version.

### `PATCH /api/v1/briefs/:id/approve` · `PATCH /api/v1/briefs/:id/reject`
Approve (atomic: supersedes the previously approved version; the approved brief is immutable) or
reject a pending brief. Approving a non-pending brief returns `409 CONFLICT`.

### `GET /api/v1/jobs/:id`
`{ job_id, job_type, status, progress, current_step, steps[], error, estimated_cost_usd,
actual_cost_usd, result, created_at, completed_at }`. Statuses: `queued`, `running`,
`awaiting_approval`, `completed`, `failed`, `cancelled`. A budget stop has
`error.code = "BUDGET_EXCEEDED"`.

### Knowledge
- `GET /api/v1/knowledge?kind=&limit=&cursor=` — page of entries.
- `POST /api/v1/knowledge` — `{ kind, title, body, source?, verified?, tags?, brand_id? }`.
- `PATCH /api/v1/knowledge/:id` · `DELETE /api/v1/knowledge/:id` (soft delete).
- `POST /api/v1/knowledge/import-voice-samples` — imports the owner's voice samples; idempotent.

Kinds: `example_post`, `opinion`, `experience`, `story`, `fact`, `voice_rule`,
`audience_insight`, `offer`, `banned_phrase`. Generation only uses `fact`, `story` and
`experience` entries once `verified` is true (enforced in the database function).

### `GET /api/v1/settings` · `PATCH /api/v1/settings`
Budgets in USD: `budget_text_project_usd`, `budget_media_project_usd`, `budget_daily_usd`,
`budget_monthly_usd` (0–10000). `model_routes`: `{ idea_analysis?, master_brief?, research_labeling?, gap_synthesis?, idea_screening?, format_writing?, section_revision?, editorial_review?, rule_proposal?, visual_direction?, slide_revision? }`, each one of
`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` (defaults: Sonnet, except research labelling: Haiku).

### `GET /api/v1/usage`
`{ today_usd, month_usd, calls_this_month, by_task[], recent[], budgets }` (UTC windows).

## Phase 2 endpoints (research)

All owner-only and RLS-scoped to the default brand.

### Keywords
- `GET /api/v1/research/queries` — `{ data: ResearchQueryRow[] }`.
- `POST /api/v1/research/queries` — `{ cluster_id, cluster_name, priority?: high|medium|benchmark, kind?: audience_language|concept|saturation, query, platforms?: (reddit|youtube|tiktok|threads|instagram)[] }`.
- `PATCH /api/v1/research/queries/:id` — `{ enabled?, priority?, platforms?, query? }` · `DELETE` (hard delete).
- `POST /api/v1/research/queries/import-starter` — imports `docs/research/research-keywords.json`; idempotent. `{ imported, skipped }`.

### Tracked creators
- `GET /api/v1/competitors` · `POST /api/v1/competitors` — `{ name, profile_url, relationship?, priority?, study_focus? }`; platform is derived from the URL.
- `PATCH /api/v1/competitors/:id` — `{ enabled?, relationship?, priority?, study_focus? }` · `DELETE` (soft delete; evidence keeps its link).
- `POST /api/v1/competitors/import-watchlist` — imports `docs/research/watchlist.json`; also fills placeholder study focus on existing creators (owner edits kept). `{ imported, updated, skipped, missing_urls }`.

### Sweeps and reports
- `POST /api/v1/research/run` — `{ cluster_ids?, include_competitors? = true, max_queries? = 6 (1–10), max_credits? = 30 (5–100) }`. `202` job (`research_sweep`). Key: settings + hour.
- `GET /api/v1/research/reports?limit=&cursor=` · `GET /api/v1/research/reports/:id` — report with `findings { stats, outliers[], gaps[], idea_ids[], rejected_ideas[], notes[] }` and the ideas it created.
- `POST /api/v1/research/sources/import` — `{ competitor_id, posts: [{ text, url?, author?, published_at?, likes?, comments?, shares? }] (≤50) }`. Stored as `provider: "manual"`; duplicates skipped. `{ imported, skipped }`.
- `POST /api/v1/research/probe` — `{ platform, mode: search|feed, value }`. Spends 1 credit; returns `{ credits, parsed_items, first_item_fields, shape }` (key paths and types only, never values).
- `GET /api/v1/research/schedule` · `PUT /api/v1/research/schedule` — `{ enabled }`. Enabling records `approved_at`.
- `GET /api/v1/cron/research` — Vercel Cron only; requires `Authorization: Bearer $CRON_SECRET`, else `401`. `{ due, started }`.

Research jobs record ScrapeCreators usage in `provider_usage` (`provider: "scrapecreators"`, `unit_type: "credit"`, cost 0 USD — credits are prepaid).

## Phase 3 endpoints (writing)

Every draft body has the same shape: `{ format, sections[{ key: "s1".., kind, text, headline, on_screen, broll }], single_point, cover_test, placeholders[], checks[], edits? }`.

- `POST /api/v1/projects/:id/write`
  - Body: `{ formats?: ContentFormat[], force?: false }`. Returns `202` with the `write_content` job.
  - Needs an approved brief, otherwise `409`. A format whose inputs haven't changed reuses its existing version.
  - `force: true` writes fresh drafts.
- `GET /api/v1/projects/:id/assets` returns `{ data: ContentAssetView[] }`: one asset per format, with versions newest first.
- `POST /api/v1/assets/:id/revise`
  - Body: `{ version, section: "sN", instruction }`. Returns `202` with the `revise_section` job.
  - The new version gets `parent_version` and `revised_section`. All other sections are copied unchanged.
- `POST /api/v1/assets/:id/versions`
  - Body: `{ base_version, sections[{ key, text, headline?, on_screen?, broll? }], note? }`.
  - Returns `201` with a new human version, whose `body.edits` holds a before/after for each change. Returns `400` if nothing changed.
- `PATCH /api/v1/versions/:id/approve`
  - Approves atomically: the previously approved version becomes `superseded`.
  - Returns `409` while `[placeholders]` remain unfilled.
- `GET /api/v1/assets/:id/export?version=n` returns a Markdown download, ready to paste.

## Phase 4 endpoints (editorial)

Each version in `GET /api/v1/projects/:id/assets` carries `review`. It is the latest review, or `null`, and has these fields:

- `total_score` (out of 100)
- `dimensions[]`: `dimension`, `score` (1–5), `evidence` (a quote) and `reason`
- `cold_reader`: TOFU drafts only
- `gate_failures[]`: `code`, `message`, `section` and `source` (`check` or `reviewer`)
- `repetition[]`
- `suggestions[]`: `id`, `section_key`, `issue`, `rewrite` and `status`
- `overrides[]`

Endpoints:

- `POST /api/v1/versions/:id/review` reviews the version on request and returns a `review_version` job. New AI drafts, revisions and accepted suggestions are reviewed automatically.
- `PATCH /api/v1/suggestions/:id` takes `{ action: "accept" | "reject" }`.
  - Accept applies the rewrite to the latest version as a new version, with no model call, then queues a review. It returns `409` if that section has changed since the review.
  - Reject is recorded. Once two rejections are waiting, rule learning starts.
- `POST /api/v1/versions/:id/overrides` takes `{ gate, reason (≥5 chars) }`.
  - It records why the owner is approving despite a failed gate.
  - It is insert-only, and returns `409` if that gate is already overridden.
- `PATCH /api/v1/versions/:id/approve` now also returns `409` for:
  - a banned phrase
  - a number found in neither the brief nor verified knowledge
  - failed gates on the latest review

  In each case it is `409` unless the gate has an override.
- `GET /api/v1/rules`, `POST /api/v1/rules` and `PATCH /api/v1/rules/:id`.
  - `POST` takes `{ rule }`. A rule the owner writes is approved immediately.
  - `PATCH` takes `{ status: approved | rejected | disabled }`.
  - Rules proposed from hand edits wait as `proposed` until the owner approves them.

## Phase 5 endpoints (carousel design)

A slide is `{ id: "d1".., layout: cover|statement|list|before_after|diagram|screenshot|closing, kicker, headline, body, items[], before, after, emphasis[], visual: none | diagram{nodes, edges} | screenshot{media_id, caption} }`. Designs are immutable versions per carousel asset.

- `POST /api/v1/assets/:id/design` takes `{ version?, template? }` and returns `202` with a `design_carousel` job.
  - It designs from the narrative version given, otherwise the approved version, otherwise the latest.
  - `template` is one of `statement`, `before_after`, `process`, `screenshot` or `notebook`; leave it out and the director chooses.
- `GET /api/v1/assets/:id/designs` returns `{ data: [design + issues[]], exports[] }`, with designs newest first. `issues` is the readability result for each slide.
- `POST /api/v1/assets/:id/designs` takes `{ base_version, template, slides[3–12] (without ids), note? }`.
  - It saves the owner's edits as a new version.
  - Slides are renumbered `d1..dN` in the order given.
- `GET /api/v1/designs/:id/slides/:slide` returns a PNG preview. It is privately cacheable, because designs never change.
- `POST /api/v1/designs/:id/revise-slide` takes `{ slide, instruction }` and returns `202` with a `revise_slide` job.
  - Only that slide changes.
  - Cover and closing layouts stay in the first and last positions.
- `POST /api/v1/designs/:id/screenshot` takes a multipart upload with `slide`, `file` (PNG or JPEG, up to 5 MB, detected from the file's bytes) and `rights=yes`.
  - The file is stored in the owner's private uploads folder.
  - It creates a new design version with the image attached.
- `POST /api/v1/designs/:id/export` takes `{ override_reason? }`.
  - It renders 1080×1350 PNGs, one PDF and a ZIP into the private renders bucket, and returns 10-minute signed links.
  - It returns `409` while a readability check fails, unless `override_reason` (at least 5 characters) is given; the reason is recorded with the export.

Readability checks:
- **overflow**: text does not fit its box.
- **font_too_small**: content text is under 28px.
- **low_contrast**: below WCAG AA, which is 4.5:1, or 3:1 for text of 64px or more.
- **too_many_words**: more than 25 words on a slide.
- **missing_screenshot**: a screenshot slide has no image.

## Types

```ts
interface Idea {
  id: string; brand_id: string; title: string; raw_input: string;
  source_type: "manual" | "research" | "repurpose" | "import";
  status: "inbox" | "developing" | "briefed" | "archived";
  tags: string[]; created_at: string; updated_at: string;
}

interface BrandProfile {
  id: string; name: string; positioning: string | null;
  audience: { primary: string; segments: string[]; pains: string[]; desired_outcomes: string[] };
  voice_profile: {
    summary: string; tone: string[]; principles: string[];
    preferred_phrases: string[]; banned_phrases: string[]; sentence_style: string;
  };
  brand_guidelines: {
    colors: Record<string, `#${string}`>; fonts: { display?: string; body?: string };
    content_pillars: string[];
  };
  is_default: boolean; status: "active" | "archived"; created_at: string; updated_at: string;
}
```

Source of truth: `packages/schemas/src`.
