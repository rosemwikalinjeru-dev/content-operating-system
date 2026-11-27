# Phase 2 — Research Intelligence: Report

Date: 2026-11-27
Exit condition (IMPLEMENTATION-PLAN §5A): *one weekly sweep produces at least three evidence-backed
gap ideas that pass the Idea Analyst.*
Status: **BUILT — awaiting the owner's live exit check** (needs `SCRAPECREATORS_API_KEY`, `CRON_SECRET`
and the research migration on the live project).

## 1. What was built

| Area | Files |
|---|---|
| Migration | `supabase/migrations/20261128000100_research.sql`: competitor `relationship`, `priority`, `study_focus` and `last_collected_at`; a new `research_queries` table (RLS); research source scores, labels and job link; a report→job link |
| Research engine | `packages/research-engine`: ScrapeCreators client (timeouts, retries, credit counting, typed errors), a tolerant response normaliser, outlier scoring, gap scoring, and starter data generated from `docs/research/*.json` |
| Agents | `packages/intelligence/src/research-agents.ts`: Research Labeller (bulk, cheap model) and Gap Synthesiser |
| Model routing | `research_labeling` uses Haiku 5.5 (effort low); `gap_synthesis` uses Sonnet 5.5 (effort medium). Both can be changed in Settings → Budgets & usage |
| Pipeline | `jobs/src/research.ts` `runResearchSweep`: collect → label → analyse → ideas. The steps can be resumed. It is registered in the inline runner and as the Trigger.dev task `research-sweep` |
| Schedule | `jobs/src/cron.ts`, `GET /api/v1/cron/research`, and `apps/web/vercel.json` (Mondays 05:17 UTC) |
| Data access | `packages/database/src/research.ts` (owner, RLS) and `research-service.ts` (worker, service role, explicit user filters) |
| API | Keywords, competitors, run, reports, manual import, probe, schedule and cron. See API-CONTRACTS "Phase 2 endpoints" |
| UI | Research tabs: Overview (run panel, weekly toggle, reports), Keywords, Competitors, Import posts & diagnostics, and a report detail page |

## 2. How a sweep works

1. **Collect.**
   - Up to `max_queries` enabled keywords are searched. High-priority clusters go first, least recently run first, plus one saturation-benchmark keyword.
   - Each keyword is searched on each of its platforms. Up to 4 tracked creators' feeds are also collected, least recently collected first.
   - Collection stops at the `max_credits` cap.
   - Posts are de-duplicated by content hash. Owner-pasted creator posts from the last 45 days are included in competitor coverage.
   - Credits used are recorded in `provider_usage`.
2. **Label.**
   - Haiku labels posts in batches of 25. Each post gets a topic (the business problem in plain words), a cluster, a hook pattern, whether it is a question, an owner-vs-builder audience flag, and a brand-fit score.
   - Posts that are already labelled are never labelled again.
3. **Analyse.**
   - Outliers are measured against each author's median (≥5 posts), else the search's median (≥8), else no outlier is claimed.
   - Gap score = outlier strength × (1 − min(coverage × 3, 1)) × brand fit × cluster weight × audience factor. Saturation topics are excluded.
   - A report is stored with the observed evidence kept separate from interpretation.
4. **Ideas.**
   - Sonnet turns the top 5 gaps into Inbox ideas (`source_type = research`).
   - Each idea carries its gap, angle, funnel stage and evidence links.
   - Evidence references the model invents are dropped. Only posts the pipeline gave it can be cited.

## 3. Safety and cost controls

- **Secrets.** The ScrapeCreators key and cron secret are server-side only. A client-bundle scan found no secret names.
- **Prompt injection.**
  - External posts are always wrapped as `<data>`. The labeller and synthesiser are told never to follow instructions inside them.
  - The synthesiser must not copy or paraphrase source posts, or invent statistics or stories.
- **Logins.** There is no logged-in scraping. LinkedIn individuals are covered by owner paste-in, not cookies.
- **Approval.** The weekly schedule runs only after the owner turns it on, which records `approved_at`. The cron endpoint rejects calls without the secret, using a constant-time comparison.
- **Spend limits.**
  - Each run has a credit cap of 5–100, default 30.
  - AI budgets apply to every model call, as in Phase 1.
  - Repeat runs within the same hour return the same job.
- **Error handling.**
  - A rejected key or exhausted credits stops the job without retrying, with a readable message.
  - Temporary errors retry.
  - Per-endpoint failures are skipped and listed in the report's collection notes.

## 4. Tests

- Full suite: 171 passing — 134 unit tests and 37 database tests.
- New in this phase:
  - research engine (20)
  - research pipeline (5)
  - research run route (3)
  - cron route (3)
  - database research tests (5), covering RLS, the query constraints and cross-tenant links.
- Typecheck, lint and `next build` are clean.

## 4A. Exit check, first run (2026-11-27)

The owner analysed three research ideas: one passed and two were flagged as generic. The topic labels
are deliberately broad (for example "founder dependency"), and synthesiser v1 stayed at that level.
Changes:

- **Gap Synthesiser v2.** For each idea it must now give:
  - a `specific_moment` drawn from the evidence wording, in a named kind of service business;
  - a `non_obvious_claim` (a hidden cause, a missed cost, or a contradiction of common advice);
  - the `generic_version` to avoid, with a list of banned stock lines.

  It writes up to two candidates per gap and skips gaps where only the generic version exists.
- **Independent idea screen** (new task `idea_screening`, Sonnet 5.5 at low effort; can be changed
  in Settings). It applies the Idea Analyst's exact genericity test, and a test keeps the two
  wordings identical. Generic or unscreened candidates never reach the Inbox. They are listed on
  the report under "kept out of the Inbox as generic".
- **Analyst context.** Ideas carry their moment, claim and generic counter-example in `raw_input`,
  so the Idea Analyst sees the specific version.
- The exit check is still open: it needs a new sweep with three or more screened ideas that pass the Idea Analyst.

## 5. Known limitations

1. **ScrapeCreators field names are unverified.** The docs were unreachable from the build environment.
   - The normaliser is tolerant and records each item's raw keys.
   - If a sweep reports "No results parsed", use Research → Import posts & diagnostics → *Check a research source* (1 credit). It shows the response structure without values, so the mapping can be fixed.
2. **LinkedIn creator feeds** are attempted through the profile endpoint but may return no posts. The fallback is paste-in import.
3. **Comment mining** (questions and objections from comments) is not built yet. The client has the endpoints (`COMMENT_ENDPOINTS`), and it is the next Phase 2 increment after the live check.
4. **Vercel duration.** A sweep runs inside one function with a 300 s limit.
   - A default sweep (about 16 requests, about 150 posts, 6 Haiku calls and 1 Sonnet call) should fit.
   - If it is cut off, the stale-job check marks it timed out and a re-run reuses the completed steps.
5. **Starter audience-language terms are drafts.** The owner should edit them on the Keywords tab.
6. **Missing watchlist URLs:** Nick Saraev and Isabella Bedoya are reported on import and not guessed.

## 6. Owner exit check

1. Set `SCRAPECREATORS_API_KEY` and `CRON_SECRET` in Vercel (Production) and redeploy.
2. Run `20261128000100_research.sql` in the Supabase SQL Editor.
3. Research → Keywords → **Import starter keywords**; Research → Competitors → **Import watchlist**.
4. Research → **Run sweep** (default 30 credits). Open the report: check that the outliers link to real posts and the gaps make sense.
5. Open the ideas it created and run **Analyse** on three of them. The exit check passes if at least three are evidence-backed and the Idea Analyst does not flag them as generic.
6. Turn on the weekly sweep.
