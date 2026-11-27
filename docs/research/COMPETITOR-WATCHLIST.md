# Competitor and benchmark watchlist

Source: owner-supplied research list, 2026-11-27. Input for Phase 2 (Research intelligence).
Machine-readable copy: `watchlist.json` (imported into `competitors` when Phase 2 ships).

## Relationship types

The list mixes three different kinds of account. ContentOS treats them differently, because
copying a craft benchmark's topics or a builder-audience competitor's angles would pull the brand
away from Brand Guidelines v1.0 (business owners, not automation builders).

| Type | Compare | Do not |
|---|---|---|
| `direct_competitor` | Topics, positioning, offers, gaps they leave | Adopt their audience (often builders, not buyers) |
| `positioning_benchmark` | How they make business owners care about AI and operations | Copy opinions or claims |
| `craft_benchmark` | Hooks, structure, spacing, storytelling, content systems | Copy topics, tone extremes (e.g. aggressive style) |

## Watchlist

| # | Creator | Type | Research priority | Study focus |
|---|---|---|---|---|
| 1 | Nate Herk | direct_competitor | 1 | Breaking down complex workflows; use cases; making technical work accessible |
| 2 | Nick Saraev | direct_competitor | — | Linking automation to marketing and business models; commercial value |
| 3 | Liam Ottley | direct_competitor | 8 | Business teardowns; before/after systems; implementation storytelling |
| 4 | Isabella Bedoya | direct_competitor | — | Connecting owners' everyday problems to systems solutions |
| 5 | Allie K. Miller | positioning_benchmark | 2 | Executive-level hooks; business implications of AI; strong opinions |
| 6 | Ethan Mollick | positioning_benchmark | 7 | Evidence-led observations; experiments; stating limitations |
| 7 | Chris Donnelly | positioning_benchmark | — | Business opportunities for a broad professional audience |
| 8 | Alex Hormozi | craft_benchmark | 6 | Short opening lines, numbers, simple commercial explanations (not the aggressive style) |
| 9 | Justin Welsh | craft_benchmark | 3 | Opening lines, spacing, one idea per post, story → lesson |
| 10 | Katelyn Bourgoin | craft_benchmark | 4 | Turning customer frustrations and buying behaviour into content |
| 11 | Alex Lieberman | positioning_benchmark | — | Packaging business observations into memorable narratives |
| 12 | Sabrina Ramonov | craft_benchmark | 5 | Original → repurposed content system; visual explanations |

Priorities are the owner's research priorities, not a verified engagement ranking.

**Missing:** profile URLs (the pasted list lost its links) and which other platforms each
creator is active on. Both are to be confirmed before monitoring is configured.

## Unverified claims in the source list

Recorded as leads only. They must not enter the knowledge base as facts or appear in content
until checked against the original source.

- "One creator analysis covering 1,096 posts found recurring short declarative hooks…" (Justin
  Welsh; attributed to 2pr.io).
- "Turning one long-form piece into 26 pieces across platforms" (Sabrina Ramonov; attributed to her
  own published system).

## Analysis framework (per creator, last 30–50 posts)

| Element | Question |
|---|---|
| Hook | What are the first 1–3 lines? Which hook pattern? |
| Topic | Which business problem? |
| Angle | Educational, contrarian, personal or analytical? |
| Structure | Story, list, observation, framework or case study? |
| Readability | Line length, paragraphing, numbers, bullets |
| Evidence | Data, screenshots, examples, experience, or none |
| CTA | Question, discussion, resource, offer, or none |
| Comments | What do people actually say? Questions and objections (feeds comment mining) |
| Conversion | Does it lead to a service, newsletter or product? |
| Outlier score | Performance relative to that creator's own baseline, not raw likes |

Outliers are only computed when enough posts exist to form a baseline; otherwise the report says
"insufficient baseline".

## Hook pattern taxonomy

Used to label hooks in research reports and, in Phase 3, to vary hooks in generated drafts.
Examples are the owner's adaptations.

| Pattern | Example |
|---|---|
| `counterintuitive` | The biggest obstacle to AI adoption isn't technology. |
| `pain_recognition` | Your business might be losing customers between enquiry and payment. |
| `strong_opinion` | Stop automating processes nobody has measured. |
| `unexpected_truth` | More software doesn't necessarily mean better operations. |
| `personal_lesson` | I used to think every repetitive task needed automation. |
| `specific_scenario` | A customer sends an enquiry at 9 PM. What happens next? |
| `commercial_insight` | You don't have a productivity problem if your team spends hours correcting avoidable errors. |
| `question` | What would happen if your best salesperson stopped working tomorrow? |
| `hidden_cost` | You could be paying to attract customers while quietly losing the ones you already have. *(from the owner's own posts)* |

## Data collection on LinkedIn

ScrapeCreators lists LinkedIn company posts and single-post lookup, but no feed of an
individual's posts. Every account here is an individual. Phase 2 therefore supports:

1. A live coverage test against one profile before promising automated LinkedIn tracking.
2. Their other platforms (YouTube, X, Instagram, TikTok) where full feeds exist.
3. **Manual import:** the owner pastes posts (and optionally metrics) into ContentOS. Stored as
   research sources with `provider = manual`; no scraping, no account risk.
