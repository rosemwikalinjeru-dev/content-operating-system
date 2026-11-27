# Phase 4 — Editorial Intelligence: Report

Date: 2026-11-27
Exit condition: *every draft gets an independent review, with a score, hard gates for invented
facts, and targeted suggestions the owner accepts or rejects. Her edits become proposed voice
rules that are used only once she approves them. An eval shows the reviewer scores her real posts
above generic AI posts.*
Status: **BUILT — awaiting the owner's exit check.** First apply `20261130000100_editorial.sql`.

## 1. What was built

| Area | Files |
|---|---|
| Migration | `supabase/migrations/20261130000100_editorial.sql`: `quality_reviews` now links to the exact version, job and prompt, with repetition and cold-reader fields. New tables `review_suggestions`, `gate_overrides` (insert-only audit trail) and `learned_rules`, all with RLS. `approve_content_version` now refuses a version with un-overridden failed gates. It also tightens the `research_queries` grants (see §3) |
| Checks (no model cost) | `packages/intelligence/src/editorial.ts`: banned phrases (whole-word), unfilled placeholders, numbers found in neither the brief nor verified knowledge, and repetition (6-word phrases and reused hooks against your approved content and voice examples) |
| Reviewer | The **Editorial Reviewer** prompt scores six weighted dimensions (hook, one point, story, voice and cover test, specificity, craft), each with a quoted line as evidence. TOFU drafts also get a cold-reader check. It never sees the writer's self-check. Its own gates catch invented stories or results and unsupported claims. It returns up to five suggested section rewrites |
| Learned rules | **Rule Proposer** (Haiku) works from your hand edits and rejected suggestions. A rule is proposed only when evidence supports it, and it is used only after you approve it. Approved rules go into every writer, revision and review, and are part of the "unchanged" check, so writing again applies them |
| Jobs | `jobs/src/editorial.ts`: `reviewVersion` (a resumable step), `review_version` and `propose_rules`. Reviews run automatically after every new AI draft, revision and accepted suggestion; reused drafts are not reviewed again |
| API | review, suggestions (accept/reject), gate overrides, rules, and stricter approval (API-CONTRACTS "Phase 4 endpoints") |
| UI | The writing studio has a **review panel**: score, dimension bars with evidence, the TOFU cold-reader check, gates with an override-with-reason button, repetition, suggestions with Accept/Reject, and Review again. **Settings → Voice rules** lists rules waiting for approval, in use, and off; you can also add your own |
| Eval | `evals/editorial/`: your posts (the voice samples plus `owner-posts/*.md`) against 8 clearly labelled synthetic generic posts, scored leave-one-out so a post is never among its own voice examples. It passes with a gap of at least 15 points, at least 85% pairwise wins and at least 10 of your posts. Run it with `pnpm eval:editorial` or the manual **Editorial eval** GitHub workflow; the report goes to `docs/evals/` |

## 2. Safeguards

- **Approval is blocked server-side** by placeholders, a banned phrase, an unsourced number, or failed review gates, unless an override has a recorded reason. The database function enforces the review gates as well.
- **Accepting a suggestion makes no model call** and builds on the latest version. It is refused if the owner has changed that section since the review, so a stale rewrite can't overwrite her work.
- **Suggestions that point to a section that doesn't exist are dropped.** Proposed rules without real evidence are dropped too.
- **The model sees external content only as data:** briefs, drafts and edits go to it inside `<data>` tags.

## 3. Found and fixed in passing

The test database (which mirrors Supabase) showed that Supabase's default privileges gave signed-in users every privilege on new tables, including `TRUNCATE`. Without the fix, the new audit-trail table would have been editable. The migration now revokes these privileges and grants back exactly what each table needs, and it does the same for the Phase 2 `research_queries` table. A test now checks that signed-in users cannot truncate application tables.

## 4. Tests

- Full suite: 217 passing (unit and database).
- New tests:
  - deterministic checks and requests (9)
  - review and rule-proposal pipelines (3, plus updates to the writing pipeline tests)
  - approve and suggestion routes (4)
  - eval report (3)
  - database editorial tests (4): gates block approval until an override, overrides cannot be edited, suggestions are worker-only, rules are owner-only and unique, and signed-in users cannot truncate
- Typecheck, lint and `next build` are clean, with no secret names in client bundles.
- **The live eval has not been run** (there is no API key in the build environment). See §5.

## 5. Known limitations

1. **The eval needs at least 10 of your posts.** With only the 4 voice samples, the report will say "not enough owner posts" and fail, even if the gap looks good.
2. **The reviewer and writer are the same model family.** To reduce self-grading bias, the reviewer has a separate prompt, gives evidence-quoted scores, never sees the writer's self-check, and has an Opus option. The eval is the real check.
3. **The number check is deliberately conservative.** It flags percentages, money, multipliers and figures of 10 or more that aren't in the brief or verified knowledge. Small counts and times of day are allowed. A legitimate number can be added to verified knowledge, or overridden with a reason.
4. **Each review adds one model call per draft,** about $0.01–0.03 on Sonnet. A four-format write therefore makes eight calls in total.
5. **Repetition uses exact and normalised phrase matching,** not meaning. Embedding-based matching is deferred.

## 6. Owner exit check

1. Run the migration.
2. **Write fresh drafts** on a project. Each format shows a score, gates and suggestions.
3. **Accept** one suggestion and **reject** another.
4. **Edit by hand**, then approve the proposed rule in Settings → Voice rules.
5. **Write fresh drafts** again, and see the rule followed.
6. Add your posts to `evals/editorial/owner-posts/` (or send them to me), add the `ANTHROPIC_API_KEY` repository secret, and run **Actions → Editorial eval**.
