# Phase 4 — Editorial Intelligence: Brief

Status: **proposed (2026-11-27), awaiting owner approval.**
Exit condition: *every draft gets an independent review: a score, hard gates for invented facts,
and targeted suggestions. The owner can accept or reject each suggestion. The owner's own edits
turn into proposed voice rules, which she approves before they are used. An eval set shows the
reviewer scores the owner's real posts above generic AI posts.*

## 1. What gets built

| # | Item | Notes |
|---|---|---|
| 4.1 | **Editorial reviewer** | A separate model call with its own prompt; it never sees the writer's self-check. It scores six dimensions from 1 to 5, each with a quoted line as evidence: hook strength, one clear point, story with intention, voice and cover test, specificity (not generic), and platform craft. TOFU drafts also get a **cold-reader** check: would someone who has never heard of you follow it? The result is a weighted score out of 100. |
| 4.2 | **Hard gates** | These block approval. Checked in code: banned phrases, unfilled placeholders, and any number or result not in the brief or verified knowledge. Checked by the model: invented stories or client results, and claims the brief marked "needs evidence" stated as fact. You can override a gate only by giving a reason, and the reason is recorded. |
| 4.3 | **Repetition check** | Done in code, at no model cost. It compares the draft with your earlier approved content and your voice examples, and flags repeated phrases of six or more words and reused hooks. |
| 4.4 | **Targeted suggestions** | Each suggestion names a section, the issue and a proposed rewrite. **Accept** applies it as a new version with no extra model call; **Reject** records your choice. |
| 4.5 | **Learned rules** | Your hand edits and rejected suggestions feed a rule proposer, for example "Never open with a question" or "Say 'clients', not 'customers'". Proposed rules wait for your approval and are only used once approved. You can switch them off at any time. |
| 4.6 | **When reviews run** | Automatically on every new AI draft and revision. On your own hand edits, only when you click **Review**. |
| 4.7 | **Eval suite** | Fixtures made of your strong posts plus clearly labelled generic AI posts. A script runs the reviewer on them and saves a score report per prompt version. It passes when your posts score clearly higher. |
| 4.8 | **Model choice** | `editorial_review` defaults to Sonnet 5.5, and `rule_proposal` to Haiku 5.5. Both can be changed in Settings. You can switch the reviewer to Opus for a more independent view. |

## 2. Out of scope

- Carousel design (Phase 5), video (Phase 6), and publishing and metrics (Phase 7).
- Similarity checks using embeddings. Exact and normalised phrase matching comes first; embeddings come later if needed.

## 3. Dependencies and risks

- **I need more of your strong posts: 10 or more for the eval set and the repetition baseline.** There are only 4 now. Without them, the eval can only show a weak result.
- **Self-grading bias:** the reviewer and writer are the same model family. To reduce this: the reviewer gets a separate prompt and evidence-quoted scores, you have the option to review with Opus, and the eval set calibrates it.
- **Cost:** about $0.01–0.03 per review on Sonnet. Running all four formats adds about $0.05–0.10 per project. Budgets are enforced as before.
- **Migration:** adds review records, suggestions, learned rules and gate overrides, with RLS and tests.

## 4. Owner exit check

1. Write a project. Each format shows a score, its gates and its suggestions.
2. Accept one suggestion and reject another.
3. Make a hand edit, then approve the rule ContentOS proposes from it.
4. Write again and see the rule followed.
5. Run the eval report, and check that your posts score above the generic ones.
