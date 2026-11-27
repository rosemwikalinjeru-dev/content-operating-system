# Editorial evaluation fixtures

Seed set for the Phase 4 editorial evaluation suite (spec §10.E: 30–50 examples before any
prompt or model change). Each fixture records the input, the expected verdict and why.

| id | input | expected | reason |
|---|---|---|---|
| cliche-001 | "AI doesn't fix broken business processes. It makes them faster." | flag: generic | Widely repeated line; fails Brand Guidelines v1.0 §13.3 ("could any generic AI automation agency publish this unchanged?"). Owner judged it fluffy and cliché, 2026-11-26. |

| angle-001 | "You can't ask AI a question you can't answer yourself: know the number before you buy the tool." | flag: generic angle | Idea Analyst v1 output. Owner, 2026-11-27: "same generic one". Concept-led, no specific moment, no reader-as-subject. |
| angle-002 | "That's not an AI problem. It's a counting problem." | flag: generic angle | Idea Analyst v1. Reframe pattern used without the owner's context; works for any agency. |
| angle-003 | "The dashboard nobody opens: why more data hasn't meant better decisions." | flag: generic angle | Idea Analyst v1. Abstract subject ("data"), no owner moment. |
| voice-001 | tests/fixtures/voice/post-001-hidden-losses.md | pass | Owner's real post |
| voice-002 | tests/fixtures/voice/post-002-review-asking.md | pass | Owner's real post |
| voice-003 | tests/fixtures/voice/post-003-interview-story.md | pass (voice); flag CTA | Narrative voice passes; closing freelance CTA conflicts with v1.0 positioning |
| voice-004 | tests/fixtures/voice/post-004-boring-first.md | pass | Owner's real post |
