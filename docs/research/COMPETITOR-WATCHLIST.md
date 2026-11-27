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
| 3 | Liam Ottley | direct_competitor | 8 | Business teardowns; before/after systems; implementation storytelling |
| 5 | Allie K. Miller | positioning_benchmark | 2 | Executive-level hooks; business implications of AI; strong opinions |
| 6 | Ethan Mollick | positioning_benchmark | 7 | Evidence-led observations; experiments; stating limitations |
| 7 | Chris Donnelly | positioning_benchmark | — | Business opportunities for a broad professional audience |
| 8 | Alex Hormozi | craft_benchmark | 6 | Short opening lines, numbers, simple commercial explanations (not the aggressive style) |
| 9 | Justin Welsh | craft_benchmark | 3 | Opening lines, spacing, one idea per post, story → lesson |
| 10 | Katelyn Bourgoin | craft_benchmark | 4 | Turning customer frustrations and buying behaviour into content |
| 11 | Alex Lieberman | positioning_benchmark | — | Packaging business observations into memorable narratives |
| 12 | Sabrina Ramonov | craft_benchmark | 5 | Original → repurposed content system; visual explanations |

Priorities are the owner's research priorities, not a verified engagement ranking.

| 13 | Lara Acosta | craft_benchmark | — | Content strategy: pillars, cadence, attention → trust |
| 14 | Megan Lieu | craft_benchmark | — | Content strategy: pillars, cadence, attention → trust |

Hook framing adopted into the writing rules (2026-11-27, owner request): Lara Acosta's
story → lesson → actionable → you; Alex Hormozi's hook → retain → reward. Techniques only: never
their lines, topics or tone. The owner also supplied *The Inbound Blueprint* (L. Kiprono, 2026),
summarised in `packages/intelligence/src/agents.ts` (CRAFT_RULES); the PDF itself is not stored
in the repository.

Profile URLs live in `watchlist.json`. Nick Saraev and Isabella Bedoya were removed by the owner (2026-11-27).
**Missing:** which other platforms each creator is active on.

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

## Niche outliers and competitor gaps → ideas (owner requirement, 2026-11-27)

Beyond tracking named accounts, research must find what is **working in the niche that the
tracked competitors are not covering**, and turn the best of it into ideas in the Idea Inbox.

### Pipeline

1. **Niche sweep.** Search by niche keywords and hashtags (not only named accounts) on platforms
   with search coverage (TikTok, Instagram, YouTube, Reddit, X; LinkedIn where available).
2. **Niche outliers.** For each post, compare engagement with its author's own baseline. A post
   from a small account that beats its baseline counts as much as a big account's hit.
3. **Topic clustering.** Group outliers into topics (e.g. "no-shows", "after-hours enquiries",
   "review requests"), keeping the source posts as evidence.
4. **Competitor coverage.** For each topic, measure how often the tracked competitors and
   benchmarks have covered it recently.
5. **Gap score** = outlier strength × (1 − competitor coverage) × fit with Brand DNA
   (pillars, audience pains, v1.0 positioning). Topics outside the brand are dropped, however
   popular.
6. **Unanswered questions.** From comment mining, questions the audience keeps asking that
   competitors' posts do not answer are scored as gaps too.
7. **Idea creation.** Top gaps become ideas in the Inbox (`source_type = research`), each linked
   to its research report and carrying:
   - the evidence (source URLs, observed metrics, collection date; estimates labelled);
   - why it is a gap (which competitors cover it, how often);
   - a suggested content type and angle;
   - **"observed"** facts kept separate from **"interpretation"**.
   Ideas from research go through the Idea Analyst like any other, so generic gaps get flagged.

### Guardrails

- Learn the topic and the audience question, never copy the post. Originality checks (Phase 4)
  compare drafts against the source posts.
- Competitor and creator content is untrusted data: passed to agents as data, never instructions.
- Weekly by default to control API cost; each sweep runs under the AI and research budgets.

### Niche research keywords (revised 2026-11-27, supersedes the starter list)

Shift: from *automation services businesses buy* to *business problems owners struggle to
understand and solve* (aligned with Brand Guidelines v1.0). Full config: `research-keywords.json`.

Each cluster has two layers:

- **Concept** — how Rose frames the problem in content and positioning.
- **Audience language** — the words owners actually post and search. Social search matches
  literal text, so sweeps use these; consultant phrasing returns little.

Priority directions (weight highest in gap scoring): founder dependency, operational visibility,
capacity constraints, system fragmentation, AI implementation gaps.

| Cluster | Priority | Concepts (content framing) | Audience language (search terms, draft) |
|---|---|---|---|
| A. Hidden inefficiencies | high | Revenue leakage; hidden costs of manual processes; information handoff failures; work trapped in spreadsheets; processes dependent on one employee | "drowning in admin", "manual data entry", "copy and paste between", "only one person knows how", "fell through the cracks" |
| B. Performance & decisions | medium | Measuring operational efficiency; operational KPIs; capacity utilisation; cost of inefficiency; ROI of process improvement | "don't know my numbers", "which KPIs should I track", "busy but not profitable", "where is the money going", "how do I measure" |
| C. AI implementation | medium | AI readiness; AI implementation failures; workflow reliability; measuring AI ROI; when not to use AI | "AI didn't work for my business", "is AI worth it", "chatbot annoyed customers", "AI tools waste of money", "AI made mistakes" |
| D. Systems & infrastructure | medium | Disconnected systems; data silos; single source of truth; manual reporting bottlenecks; operational visibility | "tools don't talk to each other", "too many apps", "double entry", "weekly report takes hours", "Zapier broke" |
| E. Scaling | high | Founder dependency; outgrowing spreadsheets; scaling without headcount; hire vs automate; standardising processes | "business can't run without me", "can't take a holiday", "everything goes through me", "outgrew spreadsheets", "hire or automate" |
| F. Revenue & customer journey | medium | Enquiry-to-payment process; unconverted enquiries; onboarding bottlenecks; delayed invoicing and cash flow; journey breakdowns | "quotes not converting", "clients ghost after quote", "chasing invoices", "onboarding takes forever", "customers slipping through" |
| Saturation benchmark | benchmark | — | missed calls, appointment reminders, booking automation, CRM for small business, lead follow-up, speed to lead |

The saturation benchmark is not a content target. It measures where competitors crowd, so gap
scores can show which clusters are under-served by comparison. Audience-language terms are a
draft: comment mining replaces them with the owners' actual phrasing as research runs.

### Outlier signals (added to the gap score)

| Signal | Question |
|---|---|
| Engagement vs baseline | Did the post beat its author's normal performance? |
| Content saturation | Are the same creators repeating the same advice? |
| Discussion gaps | Are people asking questions existing content does not answer? |
| Commercial relevance | Does the problem connect to revenue, cost, capacity or risk? |
| Audience relevance | Are owners, founders and operators discussing it (not only builders)? |
| Contribution | Can Rose add a more useful perspective than what exists? |
| Search demand (optional) | Searched for? Used as a signal only; low volume never disqualifies |

Scope: social content first (LinkedIn, plus Reddit and video-platform conversations). SEO/search
opportunity research is deferred until ContentOS produces blog articles.
