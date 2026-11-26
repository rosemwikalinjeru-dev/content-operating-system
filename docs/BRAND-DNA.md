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
| Voice → principles | v1.0 §1.3 and §7.2, plus §8.5 proof requirements; evidence rules **[earlier brand files]** |
| Voice → preferred phrases | v1.0 §7.3 |
| Voice → banned phrases | v1.0 §7.4, plus banned vocabulary **[earlier brand files]** |
| Voice → sentence style | v1.0 §4.4 (sentence case) plus voice rules 1–5 **[earlier brand files]** |
| Audience (all) | **[earlier brand files]**; v1.0 does not define an audience |
| Content pillars | v1.0 §10.4 |
| Colours, fonts | v1.0 §3.1, §4 |

### Carried over from the earlier files (not contradicted by v1.0)

- Audience structure: owner-operators of service businesses whose revenue depends on
  lead → response → booking → show-up → delivery → payment → rebooking.
- Never publish a number that was not personally measured.
- Admit the limit in the same breath as the claim; say "I don't know" when true.
- Every case study names what did not change; every build names what was left manual.
- Demo and fictional scenarios are labelled.
- Banned vocabulary: insane, crazy, 10x, secret, hack, "nobody's talking about this", "here's the truth".

## Open items (owner decisions)

- Audience: confirm whether v1.0's broader "organisations" framing should replace the service-business
  audience, or narrow it. v1.0 never names an audience.
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
