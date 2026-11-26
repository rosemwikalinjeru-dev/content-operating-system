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
