# Phase 5 — Visual and Carousel: Report

Date: 2026-11-27
Exit condition: *an approved carousel narrative becomes designed slides in the brand's look. The
owner can edit, reorder or revise one slide, and exports PNG, PDF and ZIP. Every slide passes a
readability check before export.*
Status: **BUILT — awaiting the owner's exit check.** First apply `20261201000100_visual.sql`.

## 1. What was built

| Area | Files |
|---|---|
| Migration | `supabase/migrations/20261201000100_visual.sql`: `carousel_designs` (immutable versions, RLS, and a trigger that rejects edits) and `add_carousel_design` (atomic numbering; carousel assets only) |
| Slide schema | `packages/schemas/src/visual.ts`: slide, diagram, model output, API inputs, and code-side clean-up (ids, fields per layout, emphasis must be in the headline, unusable diagram becomes a statement) |
| Layout engine | `packages/visual`: per-template brand themes, browser-free text fitting, a layout plan per slide, and the readability gate (overflow, 28px minimum, WCAG AA contrast, 25 words, missing screenshot). The renderer draws exactly the plan the gate checked. |
| Renderer | `apps/web/src/render`: next/og draws plans at 1080×1350 with the bundled brand fonts; pdf-lib assembles the PDF; fflate builds the ZIP |
| Agents | `packages/intelligence/src/visual-director.ts`: Visual Director (template, layouts, emphasis, diagrams; declares any wording change) and Slide Reviser |
| Jobs | `jobs/src/visual.ts`: `design_carousel` and `revise_slide`. Cover and closing layouts stay in the first and last positions. An uploaded screenshot is kept across revisions. |
| API | design, list designs, manual edit, slide preview PNG, slide revise, screenshot upload, export (see API-CONTRACTS "Phase 5 endpoints") |
| UI | Project → Carousel narrative tab → **Carousel design**: template picker, Design carousel, version picker, a readability badge, slide previews with per-slide issues, **Revise** and **Upload screenshot** per slide, **Edit slides** (layout, text, highlights, list items, before/after, diagram steps, reorder, add, remove), and **Export** with a recorded reason when checks fail |

## 1A. Sizes and motion graphics (owner request, 2026-11-28)

- **Sizes.**
  - 4:5 (1080×1350) is for Instagram, TikTok photo mode and LinkedIn; 1:1 (1080×1080) is for YouTube posts.
  - Layouts are authored at 4:5 and scaled vertically for 1:1. Single-line labels keep their height.
  - Preview, readability and export all work per size. Export makes a PDF and ZIP for each size, with `-4x5` or `-1x1` in the file names.
- **Motion graphics (MP4).** The owner chose to make the video in her browser, with calm motion.
  - The timeline is pure and tested (`packages/visual/src/motion.ts`). Elements ease up and fade in, staggered; highlighted words light up after the headline settles; diagram arrows draw between boxes; the footer stays still. Each slide holds for reading, then dissolves into the next. Slides last about 3–6 seconds.
  - Frames are drawn on a canvas from the same layout plan as the PNGs (`apps/web/src/motion/draw.ts`), encoded as H.264 with WebCodecs, and packed into an MP4 with mp4-muxer (`apps/web/src/motion/encode.ts`).
  - Nothing is uploaded. Owner screenshots load through `GET /api/v1/media/:id`, which serves only her own files.
  - **Verified in headless Chromium:** a 3-slide carousel produced H.264 High-profile MP4s at 1080×1350 and 1080×1080, 30fps, 11.9s, with 357 frames each. The files were checked with ffprobe, and frames were extracted and inspected.
  - **Limit:** it needs a browser with WebCodecs and H.264 encoding (Chrome, Edge or Safari on a computer). Other browsers show a clear message. The Phase 6 media server can render the same timeline server-side later.

## 2. Checked visually

Sample slides were rendered and inspected: cover, list, before/after, diagram and closing, in the Statement and Process templates.

Fixed during the check:
- the diagram arrows did not render;
- the page number was not right-aligned;
- highlighted words carried coloured spaces.

The contrast test also found that white text on Forest Teal reaches only 3.4:1. Teal panels now use Deep Night text (5.0:1), so the brand colour stays.

## 3. Safety and limits

- **Uploads:**
  - Screenshots must be PNG or JPEG, detected from the file's bytes rather than its name. SVG and other types are refused.
  - The size limit is 5 MB.
  - The owner must confirm the rights to the image.
  - Files are stored in her private uploads folder.
- **Exports** go to the private `renders` bucket (written server-side only) and download through 10-minute signed links. An override reason is stored with the export record.
- **The Visual Director** keeps approved wording and lists every change it makes, which appears on the version's note. It never adds claims, numbers or stories, and keeps `[placeholders]` as they are.
- **Bundling:** the build now traces only the fonts for the rendering routes. It previously traced the whole project, and that is fixed. The build has no warnings.

## 4. Tests

- Full suite: 245 passing.
- New tests:
  - layout and readability (7)
  - slide schema conversion (5)
  - design and slide-revision pipelines (3)
  - real PNG, PDF and ZIP rendering (1)
  - export gate route (1)
  - upload sniffing (1)
  - database design tests (2)
- Lint, typecheck and `next build` are clean, with no secret names in client bundles.

## 5. Known limitations

1. **AI image generation is not built.** The brief made it optional and off by default. Slides use type, diagrams and the owner's screenshots. An OpenAI Images adapter can be added later, behind a key and the budget controls.
2. **Text fitting uses estimated character widths, kept on the generous side.** Text may sometimes sit a little smaller than the maximum that would fit, but it never overflows the box.
3. **Diagrams are a single top-to-bottom flow of 2–6 boxes.** Branching flows are drawn in order.
4. **Single images for text posts are not included.** They were out of scope in the brief, and can reuse these templates.
5. **Exports are not listed with download links after the session.** The files and their records are kept in Storage and `media_assets`; a Media Library view is planned for Phase 7.

## 6. Owner exit check

1. Run the migration.
2. Open a project with a carousel narrative → **Carousel narrative** tab → **Design carousel**.
3. In **Edit slides**, change one slide's layout and edit a headline, then save.
4. Use **Revise** on one slide.
5. Check that the readability badge shows "all slides pass".
6. **Export**, then open the PDF and a PNG.
7. Optionally upload the PDF to LinkedIn as a document post, as a preview only.

## 7. Originality and responding to other posts (owner request, 2026-11-28)

**Not the same things everyone is talking about.**
- The niche's common takes come from research posts collected in the last 60 days:
  - topics that recur across posts;
  - 5+ word phrases that appear in three or more different posts.
- They are given as `what_everyone_is_saying` to the Idea Analyst, the Strategist, the writers (carousel narrative and video script included) and the reviser. The instruction: find the angle the niche is missing, and never reuse its phrases.
- The reviewer scores specificity at 2 or lower when the single point is a common take said the same way.
- Lifting 6+ words from a niche post is now an approval gate (`echoes_niche`). It is checked on review and again at approval, so hand edits are covered too.

**Start from someone's post.**
- Location: Idea Inbox → **+ Start from someone's post**.
- Inputs: paste their post, the author, an optional link, the platform, your take, and what to make (carousel, short-video script, LinkedIn post or X thread).
- It creates an idea that remembers those formats.
- The post goes, as data, to the analyst, Strategist, writers and reviewer, with response rules:
  - make your own point;
  - take a real stance;
  - never copy, closely paraphrase, or reuse its examples or numbers;
  - attribute its claims, and credit the author by name if you mention them.
- Copying 6+ words from it is an approval gate (`copied_from_source`).
- The idea page shows "Responding to [author]", with the original post available to view.

**Limits.**
- The niche list depends on research sweeps. Without recent sweeps it is empty, and only the owner-repetition and genericity checks apply.
- Paraphrase detection uses exact and normalised phrase matching, not meaning, so a close paraphrase with different words can pass the automatic check. The reviewer is instructed to catch restating.
