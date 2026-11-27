# Phase 3 — Multi-format Writing: Brief

Status: **approved (2026-11-27); built — see PHASE-3-REPORT.md.**
Exit condition: *an approved brief becomes a LinkedIn post, an X thread, a carousel narrative and a
short-video script in the owner's voice. Each one is versioned, can be revised one section at a
time, and every model call is costed.*

## 1. What gets built

| # | Item | Notes |
|---|---|---|
| 3.1 | **Four format writers** | LinkedIn post, X thread, carousel narrative (slide text only; design is Phase 5), short-video script (hook, beats, on-screen text, B-roll notes; production is Phase 6). Each writer reads the approved brief, Brand DNA, voice examples and verified knowledge. |
| 3.2 | **Write job** (`write_content`) | One job per approved brief. The writers run in parallel inside it. Unchanged inputs (same brief version, same format, same prompt version) are never regenerated. |
| 3.3 | **Assets and versions** | Uses the existing `content_assets` / `content_versions` tables. AI and human edits each create a new immutable version. Only one version per asset can be approved. |
| 3.4 | **Section revise** | `POST /assets/:id/revise` takes a section (for example the hook, paragraph 3, tweet 4 or slide 2) and the owner's instruction. Only that section is rewritten; the rest is copied over unchanged. |
| 3.5 | **Manual edit** | The owner edits text directly. That creates a human version, and the diff is kept for Phase 4 learned rules. |
| 3.6 | **Writing studio UI** | On the project page: one tab per format, version history, side-by-side compare, revise a section, approve, and copy / export as Markdown. |
| 3.7 | **Model routing** | New tasks `format_writing` (Sonnet 5.5, medium effort) and `section_revision` (Sonnet 5.5, low effort), both selectable in Settings. |

## 2. Writing rules (carried into every writer)

- Your four rules: one point per post, a strong hook, storytelling with intention (not an update), and the cover test.
- Hooks and delivery are benchmarked on Welsh and Hormozi techniques only: short lines, parallel structure, plain commercial logic.
- No invented stories, numbers or client results. Anything only you know goes in `[placeholders]`, and the post lists the placeholders you must fill before approving.
- Platform craft:
  - LinkedIn: about 1,300 characters at most and white space.
  - X: 280 characters per tweet, 5–10 tweets, the first tweet works on its own.
  - Carousel: 6–10 slides, one idea per slide, under about 25 words per slide.
  - Video: under 60 seconds, the spoken hook within 3 seconds.
- Each draft comes back with a short self-check: the single point, the cover-test notes and the open placeholders. The independent editorial score is Phase 4.

## 3. Out of scope (later phases)

- Editorial scoring, gates and the repetition check (Phase 4).
- Carousel design and rendering (Phase 5).
- Voice-over and video rendering (Phase 6).
- Publishing (Phase 7). Publishing stays manual.

## 4. Dependencies and risks

- **Duration:** four writers in parallel should finish in about 60–120 s, within the 300 s inline limit. If a writer fails, it is retried on its own, without rerunning the others.
- **Cost:** about $0.05–0.12 per brief for all four formats on Sonnet. Budgets are enforced before every call.
- **Voice quality depends on the voice examples.** Only 4 are in the knowledge base now. Adding more of your strong posts will help more than any prompt change.
- **Migration:** small. It adds `section` metadata on versions, the brief → asset link, and grants. RLS tests are included.

## 5. Owner exit check

1. Approve a brief.
2. Click **Write all formats**.
3. Revise one section.
4. Edit one line by hand.
5. Approve each format.
6. Copy the LinkedIn post. Check that it passes your cover test and that the costs show on the project.
