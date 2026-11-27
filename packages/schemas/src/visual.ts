/**
 * Phase 5 — carousel design data. Text and design are stored separately: a slide is structured
 * data; templates draw it. Pure (safe in the browser).
 */
import { z } from "zod";

export const CAROUSEL_TEMPLATES = ["statement", "before_after", "process", "screenshot", "notebook"] as const;
export type CarouselTemplate = (typeof CAROUSEL_TEMPLATES)[number];

export const TEMPLATE_LABELS: Record<CarouselTemplate, string> = {
  statement: "Statement (typographic)",
  before_after: "Before / After",
  process: "Process diagram",
  screenshot: "Screenshot",
  notebook: "Notebook (debugging log)",
};

export const SLIDE_LAYOUTS = ["cover", "statement", "list", "before_after", "diagram", "screenshot", "closing"] as const;
export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];

export const DiagramSpec = z.object({
  nodes: z.array(z.object({ id: z.string().min(1).max(20), label: z.string().min(1).max(40) })).min(2).max(6),
  edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().max(24).nullable().default(null) })).max(8),
});
export type DiagramSpec = z.infer<typeof DiagramSpec>;

export const SlideVisual = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("diagram"), diagram: DiagramSpec }),
  z.object({ type: z.literal("screenshot"), media_id: z.uuid().nullable(), caption: z.string().max(120).nullable().default(null) }),
]);
export type SlideVisual = z.infer<typeof SlideVisual>;

export const DesignSlide = z.object({
  id: z.string().regex(/^d\d{1,2}$/),
  layout: z.enum(SLIDE_LAYOUTS),
  kicker: z.string().max(60).nullable().default(null),
  headline: z.string().min(1).max(200),
  body: z.string().max(400).nullable().default(null),
  items: z.array(z.string().min(1).max(120)).max(5).default([]),
  before: z.string().max(200).nullable().default(null),
  after: z.string().max(200).nullable().default(null),
  /** Words or short phrases from the headline to draw in the accent colour. */
  emphasis: z.array(z.string().min(1).max(40)).max(3).default([]),
  visual: SlideVisual.default({ type: "none" }),
});
export type DesignSlide = z.infer<typeof DesignSlide>;

export const CarouselSlides = z.array(DesignSlide).min(3).max(12);

/** What the visual director returns (ids assigned by code). */
export const DesignOutput = z.object({
  template: z.enum(CAROUSEL_TEMPLATES),
  slides: z
    .array(
      z.object({
        layout: z.enum(SLIDE_LAYOUTS),
        kicker: z.string().nullable(),
        headline: z.string(),
        body: z.string().nullable(),
        items: z.array(z.string()).describe("Only for list layouts; otherwise empty."),
        before: z.string().nullable().describe("Only for before_after layouts."),
        after: z.string().nullable().describe("Only for before_after layouts."),
        emphasis: z.array(z.string()).describe("1–2 words from the headline to highlight; may be empty."),
        diagram: z
          .object({
            nodes: z.array(z.object({ id: z.string(), label: z.string() })),
            edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().nullable() })),
          })
          .nullable()
          .describe("Only for diagram layouts: 2–6 boxes, short labels."),
        wants_screenshot: z.boolean().describe("True if this slide would be strongest with the owner's own screenshot."),
      }),
    )
    .describe("6–10 slides: a cover first, a closing slide last."),
  word_changes: z.array(z.string()).describe("Every place you changed the approved narrative's words, and why. Empty if none."),
});
export type DesignOutput = z.infer<typeof DesignOutput>;

export const SlideRevisionOutput = DesignOutput.shape.slides.element.extend({
  note: z.string().describe("One sentence: what changed."),
});
export type SlideRevisionOutput = z.infer<typeof SlideRevisionOutput>;

/** Turn model output into stored slides: ids, clamping and visuals are decided by code. */
export function toDesignSlides(out: Pick<DesignOutput, "slides">): DesignSlide[] {
  return out.slides.slice(0, 12).map((s, i) => fromModelSlide(s, `d${i + 1}`));
}

export function fromModelSlide(s: DesignOutput["slides"][number], id: string): DesignSlide {
  let visual: SlideVisual = { type: "none" };
  if (s.layout === "diagram" && s.diagram) {
    const parsed = DiagramSpec.safeParse({
      nodes: s.diagram.nodes.slice(0, 6).map((n) => ({ id: n.id.slice(0, 20), label: n.label.slice(0, 40) })),
      edges: s.diagram.edges.slice(0, 8).map((e) => ({ from: e.from, to: e.to, label: e.label?.slice(0, 24) ?? null })),
    });
    if (parsed.success) visual = { type: "diagram", diagram: parsed.data };
  } else if (s.layout === "screenshot" || s.wants_screenshot) {
    visual = { type: "screenshot", media_id: null, caption: null };
  }
  const headline = s.headline.trim().slice(0, 200) || "…";
  return DesignSlide.parse({
    id,
    layout: s.layout === "diagram" && visual.type !== "diagram" ? "statement" : s.layout,
    kicker: s.kicker?.trim().slice(0, 60) || null,
    headline,
    body: s.body?.trim().slice(0, 400) || null,
    items: s.layout === "list" ? s.items.map((x) => x.trim().slice(0, 120)).filter(Boolean).slice(0, 5) : [],
    before: s.layout === "before_after" ? s.before?.trim().slice(0, 200) || null : null,
    after: s.layout === "before_after" ? s.after?.trim().slice(0, 200) || null : null,
    emphasis: s.emphasis.map((e) => e.trim()).filter((e) => e && headline.toLowerCase().includes(e.toLowerCase())).slice(0, 3),
    visual,
  });
}

/** Renumber slide ids after reorder/add/remove so they stay d1..dN in order. */
export function renumber(slides: DesignSlide[]): DesignSlide[] {
  return slides.map((s, i) => ({ ...s, id: `d${i + 1}` }));
}

// ---------------------------------------------------------------------------
// API inputs and views
// ---------------------------------------------------------------------------

export const DesignRequest = z.object({
  /** Narrative version to design from; defaults to the approved one, else the latest. */
  version: z.number().int().positive().optional(),
  template: z.enum(CAROUSEL_TEMPLATES).optional(),
});

export const DesignEdit = z.object({
  base_version: z.number().int().positive(),
  template: z.enum(CAROUSEL_TEMPLATES),
  slides: z.array(DesignSlide.omit({ id: true })).min(3).max(12),
  note: z.string().trim().max(300).optional(),
});

export const SlideReviseRequest = z.object({
  slide: z.string().regex(/^d\d{1,2}$/),
  instruction: z.string().trim().min(3).max(1000),
});

export const ExportRequest = z.object({
  /** Required to export while a readability check fails; recorded with the export. */
  override_reason: z.string().trim().min(5).max(1000).optional(),
});

export interface CarouselDesignView {
  id: string;
  version: number;
  source_version: number;
  template: CarouselTemplate;
  slides: DesignSlide[];
  change_note: string | null;
  created_by: "ai" | "human";
  model: string | null;
  created_at: string;
}

export interface ReadabilityIssue {
  slide: string;
  code: "overflow" | "font_too_small" | "low_contrast" | "too_many_words" | "missing_screenshot";
  message: string;
}
