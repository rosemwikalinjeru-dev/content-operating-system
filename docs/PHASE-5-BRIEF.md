# Phase 5 — Visual and Carousel: Brief

Status: **proposed (2026-11-27), awaiting owner approval.**
Exit condition: *an approved carousel narrative becomes designed slides in the brand's look. The
owner can edit, reorder or revise one slide, and exports PNG, PDF (ready for LinkedIn's document
post) and ZIP. Every slide passes a readability check before export.*

## 1. What gets built

| # | Item | Notes |
|---|---|---|
| 5.1 | **Slide schema** | Each slide is structured data: layout, kicker, headline, body, emphasised words, an optional visual (a diagram, your uploaded screenshot or an icon), and slide number. Text and design are stored separately, so changing a word never redraws anything by hand. |
| 5.2 | **Five templates in your brand** | Built from your Brand DNA colours (Deep Night, Forest Teal, Cobalt, Ice Blue, Warm Gold, Linen Cream) and fonts (Cormorant Garamond, DM Sans, IBM Plex Mono). The templates are: **Statement**, typographic and the TOFU default; **Before/After**; **Process diagram**, where boxes and arrows show a workflow (your systems-builder signature); **Screenshot**, your own screen with a callout; and **Notebook**, a mono "debugging log" look. Every carousel has a cover slide and a closing slide. |
| 5.3 | **Visual director** | One model call turns the approved carousel narrative into slides. It chooses a template and a layout per slide, which words to emphasise, and where a diagram would make the point faster than words. It never changes your approved words without flagging it. |
| 5.4 | **Slide editor** | On the project's Carousel tab: a live preview of every slide. You can edit text in place, change a slide's layout, reorder slides, add or remove a slide, and **Revise** one slide with an instruction. Each save is a new version, as with written formats. |
| 5.5 | **Readability gate** | Checked in code, with no model call: text must fit its box with no overflow, the minimum font size must be readable on a phone, colour contrast must meet WCAG AA, and a slide may carry at most about 25 words. Export is blocked until every slide passes, or until you override with a reason. |
| 5.6 | **Exports** | 1080×1350 PNG per slide, one PDF for LinkedIn's document post, and a ZIP of everything. Files go into Supabase Storage (private) and download through short-lived links. |
| 5.7 | **Images** | By default, slides use no AI images. They are typographic, use diagrams, or use screenshots you upload, which keeps them authentic and free. AI image generation is an **optional** adapter (OpenAI Images) that stays off until you add a key and switch it on, and it is costed like every other call. |
| 5.8 | **Model choice** | `visual_direction` defaults to Sonnet 5.5 at low effort, and `slide_revision` to Sonnet 5.5 at low effort. Both can be changed in Settings. |

## 2. One architecture change to approve

The plan said "Playwright render", which means a headless browser. On Vercel (Plan B) a browser
is heavy and slow to start, and it would push us towards the separate media worker that we have not
deployed yet.

**Proposal:** render slides with **`next/og`**, which turns layouts into images. It is already
part of Next.js, so it adds no new dependency, and it runs inside Vercel functions. It supports the
flexbox layouts and custom fonts these templates need.

PDF and ZIP would each need one small library:
- **pdf-lib** (MIT), to assemble the PDF;
- **fflate** (MIT), to build the ZIP.

The three fonts are open-licence (SIL OFL) and would be bundled with their licence files. All of
this is added to THIRD-PARTY-LICENSES before use. Playwright stays the fallback if a template
ever needs something `next/og` cannot draw.

## 3. Out of scope

- Video (Phase 6), and publishing and analytics (Phase 7).
- Single-image designs for text posts. These can reuse the same templates later. Tell me if you want them in this phase.

## 4. Risks

- `next/og` draws a subset of CSS. The templates are designed within that subset, and the readability gate catches overflow.
- Diagram slides depend on the visual director describing the workflow well. You can edit any diagram's boxes and labels.
- Cost:
  - Visual direction: about $0.01–0.03 per carousel.
  - Rendering: no AI cost.
  - AI images: off by default.

## 5. Owner exit check

1. Open a project with an approved carousel narrative, then click **Design carousel**.
2. Change one slide's layout, edit one headline, and **Revise** one slide.
3. Check the readability badges, then export the PDF, a PNG and the ZIP.
4. Upload the PDF to LinkedIn as a document post, as a preview only; you publish it yourself.
