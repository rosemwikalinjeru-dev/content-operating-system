# Brand DNA

The Brand DNA is the set of rules every ContentOS generation uses. The **live copy** is the brand
profile saved in Settings (stored in Supabase). The **defaults** in
`packages/schemas/src/brand-defaults.ts` are a starting point loaded into the Settings form; they
are never applied without the owner saving them.

## Sources, in priority order

1. **Rose Njeru Automation — Brand Identity & Guidelines, Version 1.0, November 2026.**
   Primary. Supersedes earlier brand files wherever they disagree.
2. **Earlier brand strategy files** (`njeru-brand-strategy` skill: BRAND_ASSET, brand-voice,
   audience). Used only where v1.0 is silent and the content does not contradict it.
3. The owner's own edits in Settings. Always win over both.

## Conflicts resolved

| Topic | Earlier files | v1.0 (adopted) |
|---|---|---|
| Category | Business systems and automation | Business Performance Organisation |
| Palette | Petrol `#0B3B3C`, Bone `#F2EFE6`, Signal Amber `#F2A93B` | Deep Night, Linen Cream, Forest Teal, Cobalt, Ice Blue, Warm Gold |
| Typefaces | Archivo, IBM Plex Sans, IBM Plex Mono | Cormorant Garamond, DM Sans, IBM Plex Mono |
| Accent rule | Amber once per asset | Gold used sparingly, as a premium accent |
| Content pillars | Diagnosis, The Build, The Breakage | Seven social content categories (§10.4) |

**Action for the owner:** the `njeru-brand-strategy` skill still describes the earlier palette and
category. Update it, or other tools that read it will produce off-brand assets.

## Field mapping

| Settings field | Source |
|---|---|
| Positioning | v1.0 §1.1–1.2 |
| Messaging → brand line, promise | v1.0 §1.1, §8.1 |
| Messaging → message pillars | v1.0 §8.4 |
| Messaging → methodology | v1.0 §9.1 (Diagnose → Strategise → Design → Implement → Optimise, looping back) |
| Messaging → messaging structure | v1.0 §7.5 |
| Voice → summary, tone | v1.0 §7.1–7.2 |
| Voice → principles | v1.0 §1.3, §7.2, §8.5, §10.4, §13.3 |
| Voice → preferred phrases | v1.0 §7.3 |
| Voice → banned phrases | v1.0 §7.4, plus banned vocabulary **[earlier brand files]** |
| Voice → sentence style | v1.0 §4.4 (sentence case) plus plain-voice rules **[earlier brand files]** |
| Audience | v1.0 §1.1–1.2 (businesses and organisations), §7.5 (challenge example), §1.1 promise |
| Content pillars | v1.0 §10.4 |
| Colours, fonts | v1.0 §3.1, §4 |

### Carried over from the earlier files (not contradicted by v1.0)

- Banned vocabulary: insane, crazy, 10x, secret, hack, "nobody's talking about this", "here's the truth".
- Sentence mechanics: lead with the finding, short declaratives, name real tools, no urgency devices.
- Voice summary: "Direct and calm, never hyped."

Removed at the owner's request (2026-11-26): the service-business audience definition
(lead → response → booking → … chain) and the evidence rules (unmeasured numbers, "what did not
change", "what was left manual", demo labelling). v1.0 governs both.

## Observed voice (from the owner's posts, 2026-11-26)

Source: four posts in `tests/fixtures/voice/`. These govern the **voice register**; v1.0 governs
positioning and visuals.

- Opens with the hidden cost in one sentence.
- Specific moments over concepts ("They messaged Friday night. You replied Monday.").
- Everyday analogies (kitchen drawer vs garage; "Happy people make dinner.").
- Two-line reframe ("That's not a reputation problem. It's an asking problem.").
- One-line paragraphs, fragments for rhythm, numbered scenes.
- Aphoristic close ("Boring and frequent beats big and complicated.").
- Signature ending: one action for today, often a question to ask the team.
- AI is rarely mentioned; the business problem carries the post.

**Register tension:** v1.0's preferred vocabulary (strategic transformation, business
intelligence) is more executive than the posts. Resolution: use it where natural; never force it
into social content. The interview story's freelance call to action conflicts with v1.0
positioning and is excluded as a pattern.

## Content strategy (owner, 2026-11-27)

### Post rules (applied by every writing agent; checked in Phase 4)

1. **One point per post.** A second point belongs in another post. Briefs state it as `single_point`.
2. **A strong hook.** The first line earns the second.
3. **Storytelling with intention.** Every story leads to the single point. Never an update.
4. **The cover test.** With name and photo hidden, readers still know it is Rose. Briefs state what
   makes each post pass it (`cover_test`); the Phase 4 editorial review scores it.

### Content types and target mix

The owner supplied three frameworks that disagree (60/30/10 upper/mid/lower funnel; a
top/mid/bottom funnel of challenges → deep-dives → demos; and 40/30/20/10
growth/authority/conversion/personal). They are third-party opinions, not measured results.
ContentOS uses the four-type model because it is the only one with both conversion and
personal posts, and merges the other two into its descriptions:

| Type | Default | Covers |
|---|---|---|
| growth (TOFU) | 70% | Hot takes, industry challenges, everyday operational moments, bold observations, for owners who have never heard of her |
| authority | 20% | Frameworks, solving one specific problem, teardowns, trend breakdowns, real case studies |
| conversion | 5% | Offers, demos, before/after scenarios (labelled unless real), one clear call to action |
| personal | 5% | Mistakes, turning points, behind the scenes, life moments that taught something about the industry |

**Owner decision (2026-11-27): the focus is top-of-funnel (TOFU) content.** The default mix moved
from 40/30/20/10 to 70/20/5/5. Migration `20261129000300_tofu_mix.sql` applies this to a brand
still on the old default; a mix the owner has edited is left alone. Every agent defaults to growth:
- the Idea Analyst gives at least two growth angles;
- the Strategist chooses growth unless the idea clearly belongs elsewhere;
- the gap synthesiser defaults to growth.

Growth drafts are written for a business owner with no prior context: no jargon, no offer, no
"DM me". They close with a low-effort action.

The mix is editable in Settings (must total 100%). Each brief chooses a type; the Strategist sees
the last 20 approved briefs' types and leans toward whichever is under target.

**Evidence constraint:** conversion content in these frameworks relies on client results and
testimonials. Until real outcomes exist, conversion posts use demos, teardowns and offers, and
hypothetical before/after scenarios are labelled as such.

## Open items (owner decisions)

- Audience segments: v1.0 does not name industries, so the segments list is empty. Add any the owner
  wants targeted.
- Font licensing: v1.0 lists the typefaces as recommendations pending approval. All three are SIL OFL
  1.1 (see THIRD-PARTY-LICENSES.md), so licensing does not block them.
- Methodology name: v1.0 says not to invent an official name. ContentOS uses only the five stages.

## How ContentOS uses this

- **Phase 1** retrieves Brand DNA into every generation prompt (positioning, voice, principles,
  messaging structure) and adds the owner's real posts as voice examples.
- **Phase 4** editorial review flags banned phrases, unsupported claims, missing measurement or
  limits, and content any generic agency could publish unchanged (v1.0 §13.3).
- **Phase 5** carousel templates use the palette, typography hierarchy (editorial serif for
  headlines, sans for body, mono for metrics) and 8px spacing.

## Accessibility of the palette (measured contrast ratios, WCAG)

| Pair | Ratio | Use |
|---|---|---|
| Deep Night on Linen Cream | 14.83 | body text |
| Linen Cream on Deep Night | 14.83 | text on dark |
| White on `#157A5B` (darkened teal) | 5.29 | light-mode buttons |
| Forest Teal `#1D9E75` on white | 3.39 | large text and graphics only |
| Deep Night on Forest Teal | 5.04 | dark-mode buttons |
| Warm Gold on Linen Cream | 1.99 | decorative only, never text |
