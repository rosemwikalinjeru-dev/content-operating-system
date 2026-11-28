/**
 * Slide layout planning. A plan is a list of absolutely positioned elements with every text
 * block already fitted (font size and lines chosen). The renderer only draws the plan, and the
 * readability gate only reads it, so the two can never disagree.
 */
import type { BrandProfile, CarouselTemplate, DesignSlide, ReadabilityIssue } from "@contentos/schemas";
import { contrast } from "./color";
import { fitText, wordCount, type FontRole } from "./text";

export const CANVAS = { width: 1080, height: 1350, pad: 96 } as const;

/** Output sizes. Layouts are authored at 4:5 and scaled vertically for other ratios. */
export const ASPECT_SIZES = {
  "4:5": { width: 1080, height: 1350 },
  "1:1": { width: 1080, height: 1080 },
} as const;
export type Aspect = keyof typeof ASPECT_SIZES;
/** Smallest readable content size on a phone (1080px canvas shown ~380px wide). */
export const MIN_FONT = 28;
export const MAX_WORDS = 25;

export interface Theme {
  bg: string;
  text: string;
  muted: string;
  accent: string;
  card: string;
  cardText: string;
  strong: string;
  strongText: string;
  headlineFont: FontRole;
  bodyFont: FontRole;
}

const DEFAULT_COLORS = {
  deep_night: "#1A1A2E",
  forest_teal: "#1D9E75",
  cobalt: "#2563EB",
  ice_blue: "#E3EEFB",
  warm_gold: "#C9A84C",
  linen_cream: "#F1EFE8",
};

export function themeFor(template: CarouselTemplate, brand: Pick<BrandProfile, "brand_guidelines">): Theme {
  const c = { ...DEFAULT_COLORS, ...(brand.brand_guidelines.colors ?? {}) } as typeof DEFAULT_COLORS;
  switch (template) {
    case "statement":
      return { bg: c.linen_cream, text: c.deep_night, muted: "#4A4A5E", accent: "#167A5B", card: c.ice_blue, cardText: c.deep_night, strong: c.deep_night, strongText: c.linen_cream, headlineFont: "display", bodyFont: "body" };
    case "before_after":
      return { bg: c.ice_blue, text: c.deep_night, muted: "#3E4A5E", accent: "#1D4ED8", card: "#FFFFFF", cardText: c.deep_night, strong: c.deep_night, strongText: c.linen_cream, headlineFont: "display", bodyFont: "body" };
    case "process":
      return { bg: c.deep_night, text: c.linen_cream, muted: "#B8B6C8", accent: "#3FC79B", card: c.cobalt, cardText: "#FFFFFF", strong: c.forest_teal, strongText: c.deep_night, headlineFont: "body", bodyFont: "body" };
    case "screenshot":
      return { bg: c.linen_cream, text: c.deep_night, muted: "#4A4A5E", accent: "#1D4ED8", card: "#FFFFFF", cardText: c.deep_night, strong: c.deep_night, strongText: c.linen_cream, headlineFont: "display", bodyFont: "body" };
    case "notebook":
      return { bg: c.deep_night, text: c.linen_cream, muted: "#B8B6C8", accent: c.warm_gold, card: "#26264A", cardText: c.linen_cream, strong: c.warm_gold, strongText: c.deep_night, headlineFont: "mono", bodyFont: "mono" };
  }
}

export interface TextEl {
  kind: "text";
  part: string;
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  size: number;
  font: FontRole;
  weight: 400 | 500 | 600 | 700;
  color: string;
  /** What the text sits on (for contrast). */
  on: string;
  align: "left" | "center" | "right";
  emphasis: string[];
  emphasisColor: string;
  fits: boolean;
  /** Decorative text (footer, slide number) is exempt from the minimum size. */
  decorative?: boolean;
}
export interface RectEl {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  radius: number;
  stroke?: string;
}
export interface ImageEl {
  kind: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  mediaId: string;
}
export interface ArrowEl {
  kind: "arrow";
  x: number;
  y1: number;
  y2: number;
  color: string;
}
export type PlanEl = TextEl | RectEl | ImageEl | ArrowEl;

export interface SlidePlan {
  slideId: string;
  width: number;
  height: number;
  bg: string;
  elements: PlanEl[];
  issues: ReadabilityIssue[];
}

interface Ctx {
  theme: Theme;
  els: PlanEl[];
  /** Vertical scale from the 1350px authoring height to the output height. */
  sy: number;
}

const sv = (ctx: Ctx, v: number) => Math.round(v * ctx.sy);

function pushShape(ctx: Ctx, el: RectEl | ArrowEl | ImageEl): void {
  if (el.kind === "arrow") ctx.els.push({ ...el, y1: sv(ctx, el.y1), y2: sv(ctx, el.y2) });
  else ctx.els.push({ ...el, y: sv(ctx, el.y), h: sv(ctx, el.h) });
}

function text(
  ctx: Ctx,
  part: string,
  value: string,
  box: { x: number; y: number; w: number; h: number },
  opts: { font: FontRole; max: number; min?: number; weight?: TextEl["weight"]; color?: string; on?: string; align?: TextEl["align"]; emphasis?: string[]; decorative?: boolean; absolute?: boolean; fixedHeight?: boolean },
): TextEl {
  // Boxes are authored at 1350px tall; scale them to the output height before fitting.
  // Single-line labels keep their height (they only move); text blocks scale with the canvas.
  if (!opts.absolute) box = { ...box, y: sv(ctx, box.y), h: opts.fixedHeight ? box.h : sv(ctx, box.h) };
  const fit = fitText(value, box, opts.font, opts.max, opts.min ?? MIN_FONT);
  const el: TextEl = {
    kind: "text",
    part,
    ...box,
    lines: fit.lines,
    size: fit.size,
    font: opts.font,
    weight: opts.weight ?? 400,
    color: opts.color ?? ctx.theme.text,
    on: opts.on ?? ctx.theme.bg,
    align: opts.align ?? "left",
    emphasis: opts.emphasis ?? [],
    emphasisColor: ctx.theme.accent,
    fits: fit.fits,
    decorative: opts.decorative,
  };
  ctx.els.push(el);
  return el;
}

/** Order diagram nodes along the edges (a simple flow), keeping unlinked nodes at the end. */
export function orderNodes(diagram: { nodes: Array<{ id: string; label: string }>; edges: Array<{ from: string; to: string; label: string | null }> }) {
  const incoming = new Set(diagram.edges.map((e) => e.to));
  const start = diagram.nodes.find((n) => !incoming.has(n.id)) ?? diagram.nodes[0];
  const ordered: typeof diagram.nodes = [];
  let cur = start;
  while (cur && !ordered.includes(cur)) {
    ordered.push(cur);
    const next = diagram.edges.find((e) => e.from === cur!.id);
    cur = next ? diagram.nodes.find((n) => n.id === next.to) : undefined;
  }
  return [...ordered, ...diagram.nodes.filter((n) => !ordered.includes(n))];
}

export function planSlide(
  slide: DesignSlide,
  opts: { template: CarouselTemplate; brand: Pick<BrandProfile, "brand_guidelines" | "name">; index: number; total: number; aspect?: Aspect },
): SlidePlan {
  const theme = themeFor(opts.template, opts.brand);
  const size = ASPECT_SIZES[opts.aspect ?? "4:5"];
  const ctx: Ctx = { theme, els: [], sy: size.height / CANVAS.height };
  const { width: W, pad: P } = CANVAS;
  const H = size.height;
  const cw = W - 2 * P;
  const bg = theme.bg;
  const hf = theme.headlineFont;
  const bf = theme.bodyFont;
  const hw: TextEl["weight"] = hf === "display" ? 600 : 700;

  if (slide.kicker) text(ctx, "kicker", slide.kicker.toUpperCase(), { x: P, y: P, w: cw, h: 44 }, { font: "mono", max: 30, color: theme.accent, weight: 500, fixedHeight: true });

  switch (slide.layout) {
    case "cover":
      text(ctx, "headline", slide.headline, { x: P, y: 240, w: cw, h: 640 }, { font: hf, max: 124, min: 60, weight: hw, emphasis: slide.emphasis });
      if (slide.body) text(ctx, "body", slide.body, { x: P, y: 920, w: cw, h: 220 }, { font: bf, max: 42, color: theme.muted });
      break;
    case "statement":
    case "closing":
      text(ctx, "headline", slide.headline, { x: P, y: slide.layout === "closing" ? 300 : 220, w: cw, h: 560 }, { font: hf, max: 100, min: 52, weight: hw, emphasis: slide.emphasis });
      if (slide.body) text(ctx, "body", slide.body, { x: P, y: 840, w: cw, h: 320 }, { font: bf, max: 42, color: slide.layout === "closing" ? theme.text : theme.muted });
      break;
    case "list": {
      text(ctx, "headline", slide.headline, { x: P, y: 190, w: cw, h: 300 }, { font: hf, max: 76, min: 48, weight: hw, emphasis: slide.emphasis });
      const n = Math.max(1, slide.items.length);
      const top = 520;
      const slot = Math.floor(640 / n);
      slide.items.forEach((item, i) => {
        const y = top + i * slot;
        text(ctx, `item${i + 1}`, `${i + 1}`, { x: P, y, w: 64, h: slot - 16 }, { font: "mono", max: 40, color: theme.accent, weight: 500 });
        text(ctx, `item${i + 1}`, item, { x: P + 80, y, w: cw - 80, h: slot - 16 }, { font: bf, max: 40 });
      });
      break;
    }
    case "before_after": {
      text(ctx, "headline", slide.headline, { x: P, y: 190, w: cw, h: 260 }, { font: hf, max: 70, min: 44, weight: hw, emphasis: slide.emphasis });
      const card = (label: string, value: string, y: number, fill: string, ink: string) => {
        pushShape(ctx, { kind: "rect", x: P, y, w: cw, h: 310, fill, radius: 24 });
        text(ctx, `${label}_label`, label, { x: P + 40, y: y + 32, w: cw - 80, h: 40 }, { font: "mono", max: 28, color: ink, on: fill, weight: 500, fixedHeight: true });
        text(ctx, label, value, { x: P + 40, y: y + 84, w: cw - 80, h: 200 }, { font: bf, max: 44, color: ink, on: fill });
      };
      card("BEFORE", slide.before ?? "", 490, theme.card, theme.cardText);
      card("AFTER", slide.after ?? "", 840, theme.strong, theme.strongText);
      break;
    }
    case "diagram": {
      text(ctx, "headline", slide.headline, { x: P, y: 190, w: cw, h: 240 }, { font: hf, max: 66, min: 44, weight: hw, emphasis: slide.emphasis });
      const nodes = slide.visual.type === "diagram" ? orderNodes(slide.visual.diagram) : [];
      const top = 470;
      const area = slide.body ? 560 : 680;
      const gap = 44;
      const boxH = Math.min(130, Math.floor((area - gap * (nodes.length - 1)) / Math.max(1, nodes.length)));
      nodes.forEach((node, i) => {
        const y = top + i * (boxH + gap);
        pushShape(ctx, { kind: "rect", x: P + 60, y, w: cw - 120, h: boxH, fill: theme.card, radius: 18 });
        text(ctx, `node_${node.id}`, node.label, { x: P + 96, y: y + 14, w: cw - 192, h: boxH - 28 }, { font: "body", max: 38, color: theme.cardText, on: theme.card, align: "center", weight: 500 });
        if (i < nodes.length - 1) pushShape(ctx, { kind: "arrow", x: W / 2, y1: y + boxH + 6, y2: y + boxH + gap - 6, color: theme.accent });
      });
      if (slide.body) text(ctx, "body", slide.body, { x: P, y: 1060, w: cw, h: 110 }, { font: bf, max: 34, color: theme.muted });
      break;
    }
    case "screenshot": {
      text(ctx, "headline", slide.headline, { x: P, y: 190, w: cw, h: 230 }, { font: hf, max: 62, min: 42, weight: hw, emphasis: slide.emphasis });
      const box = { x: P, y: 450, w: cw, h: 600 };
      const media = slide.visual.type === "screenshot" ? slide.visual.media_id : null;
      if (media) pushShape(ctx, { kind: "image", ...box, mediaId: media });
      else {
        pushShape(ctx, { kind: "rect", ...box, fill: theme.card, radius: 20, stroke: theme.muted });
        text(ctx, "placeholder", "Add your screenshot", { x: P + 40, y: 720, w: cw - 80, h: 60 }, { font: "body", max: 36, color: theme.muted, on: theme.card, align: "center" });
      }
      const caption = slide.visual.type === "screenshot" ? slide.visual.caption ?? slide.body : slide.body;
      if (caption) text(ctx, "caption", caption, { x: P, y: 1074, w: cw, h: 100 }, { font: bf, max: 32, color: theme.muted });
      break;
    }
  }

  // Footer: brand and position. Decorative, so exempt from the content minimum size.
  text(ctx, "footer_brand", opts.brand.name, { x: P, y: H - P - 34, w: cw - 200, h: 40 }, { font: "body", max: 26, min: 20, color: theme.muted, decorative: true, weight: 500, absolute: true });
  text(ctx, "footer_page", `${opts.index + 1} / ${opts.total}`, { x: W - P - 180, y: H - P - 34, w: 180, h: 40 }, { font: "mono", max: 26, min: 20, color: theme.muted, decorative: true, align: "right", absolute: true });

  const plan: SlidePlan = { slideId: slide.id, width: size.width, height: H, bg, elements: ctx.els, issues: [] };
  plan.issues = checkPlan(plan, slide);
  return plan;
}

/** The readability gate for one slide. */
export function checkPlan(plan: SlidePlan, slide: DesignSlide): ReadabilityIssue[] {
  const issues: ReadabilityIssue[] = [];
  for (const el of plan.elements) {
    if (el.kind !== "text") continue;
    if (!el.fits) issues.push({ slide: slide.id, code: "overflow", message: `The ${el.part.replace(/_/g, " ")} does not fit. Shorten it.` });
    if (!el.decorative && el.size < MIN_FONT) issues.push({ slide: slide.id, code: "font_too_small", message: `The ${el.part} is ${el.size}px; the minimum is ${MIN_FONT}px.` });
    const min = el.size >= 64 ? 3 : 4.5;
    const ratio = contrast(el.color, el.on);
    if (ratio < min) issues.push({ slide: slide.id, code: "low_contrast", message: `The ${el.part.replace(/_/g, " ")} contrast is ${ratio}:1; it needs ${min}:1.` });
    if (el.emphasis.length) {
      const er = contrast(el.emphasisColor, el.on);
      if (er < min) issues.push({ slide: slide.id, code: "low_contrast", message: `Highlighted words contrast is ${er}:1; they need ${min}:1.` });
    }
  }
  const words =
    wordCount(slide.headline) + wordCount(slide.body) + slide.items.reduce((n, i) => n + wordCount(i), 0) + wordCount(slide.before) + wordCount(slide.after);
  if (words > MAX_WORDS) issues.push({ slide: slide.id, code: "too_many_words", message: `${words} words; keep a slide to ${MAX_WORDS} or fewer.` });
  if (slide.layout === "screenshot" && !(slide.visual.type === "screenshot" && slide.visual.media_id)) {
    issues.push({ slide: slide.id, code: "missing_screenshot", message: "Upload your screenshot, or change the layout." });
  }
  // One message per code per slide.
  return issues.filter((i, n) => issues.findIndex((j) => j.code === i.code && j.message === i.message) === n);
}

export function planCarousel(
  slides: DesignSlide[],
  opts: { template: CarouselTemplate; brand: Pick<BrandProfile, "brand_guidelines" | "name">; aspect?: Aspect },
): SlidePlan[] {
  return slides.map((s, index) => planSlide(s, { ...opts, index, total: slides.length }));
}
