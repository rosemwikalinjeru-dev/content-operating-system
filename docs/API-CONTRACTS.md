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
`budget_monthly_usd` (0–10000).

### `GET /api/v1/usage`
`{ today_usd, month_usd, calls_this_month, by_task[], recent[], budgets }` (UTC windows).

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
