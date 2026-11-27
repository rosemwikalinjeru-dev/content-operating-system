# Phase 3 — Multi-format Writing: Report

Date: 2026-11-27
Exit condition: *an approved brief becomes a LinkedIn post, an X thread, a carousel narrative and a
short-video script in the owner's voice. Each is versioned, can be revised one section at a time,
and every model call is costed.*
Status: **BUILT — awaiting the owner's exit check.** First apply `20261129000100_writing.sql`.

## 1. What was built

| Area | Files |
|---|---|
| Migration | `supabase/migrations/20261129000100_writing.sql`: one live asset per project and format; version `input_hash`, `parent_version` and `revised_section`; atomic `add_content_version` and `approve_content_version` (security invoker, so RLS applies) |
| Body model | `packages/schemas/src/writing.ts`: one keyed-section shape for every format. Code (not the model) assigns keys, finds `[placeholders]` and runs the platform checks. Also hand-edit merge with before/after, and Markdown export |
| Writers | `packages/intelligence/src/writers.ts`: LinkedIn, X thread, carousel narrative and short-video writers (shared rules plus your four post rules and craft rules), and the section reviser |
| Routing | `format_writing` (Sonnet 5.5, medium effort) and `section_revision` (Sonnet 5.5, low effort); both can be changed in Settings |
| Jobs | `jobs/src/writing.ts`: `write_content` runs the four writers in parallel, one resumable step each, and reuses unchanged formats. `revise_section` rewrites one section and copies the rest. Registered inline and on Trigger.dev |
| Data access | `packages/database/src/writing.ts` (owner, RLS) and `writing-service.ts` (worker) |
| API | write, assets, revise, manual edit, approve and export (API-CONTRACTS "Phase 3 endpoints") |
| UI | Project page → **Writing**: Write all formats or fresh drafts, one tab per format, version picker, changed sections highlighted with the previous text, revise per section, edit by hand, approve, copy and download `.md`, self-check |

## 2. Safeguards

- **No invention.** Owner-only details become `[placeholders]`. Approval is blocked until they are filled, both in the UI and in the API (`409`).
- **Immutable versions.** Versions can't be changed after they are written (database trigger). Revisions and hand edits always create a new version, and only one version per format can be approved at a time.
- **Untrusted input.** The approved brief and the draft go to the model as `<data>`; the owner's revise instruction is kept outside it.
- **No silent cuts.** Platform limits (characters, tweet and slide counts, spoken length, hook length) show as warnings for you to act on. Nothing is trimmed silently.
- **No repeat spend.** An unchanged format is not rewritten. A double click returns the same job. Budgets are checked before every call.

## 3. Tests

- Full suite: 194 passing (unit and database).
- New tests:
  - body logic (6)
  - writers (3)
  - write and revise pipelines (6)
  - approve route (2)
  - database writing tests (3): atomic numbering, a single approved version, immutability, one asset per format, and cross-tenant attempts refused
- Typecheck, lint and `next build` are clean. No secret names appear in client bundles.

## 3A. Fix: approved brief not visible on the dashboard (2026-11-27)

- **Symptom:** after a brief was approved, the dashboard did not change.
- **Cause:** `approve_brief` updated the project but never moved the source idea from "developing" to "briefed". The dashboard only counted ideas by status, so the approval never showed.
- **Fix:**
  - Migration `20261129000200_brief_marks_idea.sql` marks the idea as briefed on approval and backfills ideas that were already approved. A database test covers it.
  - The dashboard now also shows "Briefs awaiting approval" and a Projects list with each project's stage.

## 4. Known limitations

1. Only 4 voice examples are in the knowledge base. Adding more of your strong posts is the biggest quality lever.
2. The carousel is text only. Layout and rendering come in Phase 5, and the video script is not produced until Phase 6.
3. Compare shows the previous text for each changed section, not a word-level diff.
4. Editorial scoring of drafts comes in Phase 4. Each draft's self-check comes from the same model that wrote it, so it is not an independent review.

## 5. Owner exit check

1. Run the migration in Supabase.
2. Open a project with an approved brief and click **Write all formats**.
3. On one format, **Revise** a section with an instruction.
4. On another, **Edit by hand** and save.
5. Fill any `[placeholders]`, then approve each format.
6. **Copy** the LinkedIn post. It should pass your cover test, and the costs should show in Budgets & usage.
