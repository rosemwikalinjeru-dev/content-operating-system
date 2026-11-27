import { CAROUSEL_TEMPLATES, ROSE_NJERU_DEFAULTS, type DesignSlide } from "@contentos/schemas";
import { describe, expect, it } from "vitest";
import { contrast } from "./color";
import { MAX_WORDS, orderNodes, planCarousel, planSlide, themeFor } from "./plan";
import { fitText, wrap } from "./text";

const brand = { name: "Rose Njeru Automation", brand_guidelines: ROSE_NJERU_DEFAULTS.brand_guidelines } as never;
const slide = (p: Partial<DesignSlide>): DesignSlide => ({
  id: "d1",
  layout: "statement",
  kicker: null,
  headline: "Your quote went out on Tuesday.",
  body: null,
  items: [],
  before: null,
  after: null,
  emphasis: [],
  visual: { type: "none" },
  ...p,
});

describe("text fitting", () => {
  it("wraps by words and shrinks to fit", () => {
    expect(wrap("one two three", 100, 300, "body").lines.length).toBeGreaterThan(1);
    const fit = fitText("A long headline that needs several lines to fit", { w: 888, h: 300 }, "display", 120, 48);
    expect(fit.fits).toBe(true);
    expect(fit.size).toBeLessThan(120);
    expect(fit.lines.length * fit.size * 1.1).toBeLessThanOrEqual(300);
  });

  it("reports text that cannot fit even at the minimum size", () => {
    expect(fitText("word ".repeat(200), { w: 888, h: 100 }, "body", 40, 28).fits).toBe(false);
  });
});

describe("brand themes", () => {
  it("every template's text, muted text, highlight and card text pass WCAG AA on their backgrounds", () => {
    for (const t of CAROUSEL_TEMPLATES) {
      const th = themeFor(t, brand);
      expect(contrast(th.text, th.bg), `${t} text`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(th.muted, th.bg), `${t} muted`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(th.accent, th.bg), `${t} accent`).toBeGreaterThanOrEqual(3);
      expect(contrast(th.cardText, th.card), `${t} card`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(th.strongText, th.strong), `${t} strong`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("readability gate", () => {
  it("a short statement slide passes in every template", () => {
    for (const t of CAROUSEL_TEMPLATES) expect(planSlide(slide({}), { template: t, brand, index: 0, total: 6 }).issues, t).toEqual([]);
  });

  it("flags too many words, overflow and a missing screenshot", () => {
    const long = slide({ headline: "word ".repeat(30).trim() });
    const codes = planSlide(long, { template: "statement", brand, index: 0, total: 6 }).issues.map((i) => i.code);
    expect(codes).toContain("too_many_words");
    const huge = slide({ headline: "x", body: "supercalifragilisticexpialidocious".repeat(4) });
    expect(planSlide(huge, { template: "statement", brand, index: 0, total: 6 }).issues.map((i) => i.code)).toContain("overflow");
    const shot = slide({ layout: "screenshot", visual: { type: "screenshot", media_id: null, caption: null } });
    expect(planSlide(shot, { template: "screenshot", brand, index: 0, total: 6 }).issues.map((i) => i.code)).toContain("missing_screenshot");
  });

  it("lays out list, before/after and diagram slides without issues", () => {
    const slides: DesignSlide[] = [
      slide({ layout: "cover", headline: "The quote that never got a reply", emphasis: ["never"] }),
      slide({ id: "d2", layout: "list", headline: "Where it stalls", items: ["Typed twice", "Priced by memory", "Sent on Friday"] }),
      slide({ id: "d3", layout: "before_after", headline: "One handoff", before: "Details retyped into three tools", after: "Captured once, carried through" }),
      slide({
        id: "d4",
        layout: "diagram",
        headline: "Follow the enquiry",
        visual: { type: "diagram", diagram: { nodes: [{ id: "b", label: "Quote" }, { id: "a", label: "Enquiry" }, { id: "c", label: "Booking" }], edges: [{ from: "a", to: "b", label: null }, { from: "b", to: "c", label: null }] } },
      }),
      slide({ id: "d5", layout: "closing", headline: "Count the retyped fields this week." }),
    ];
    const plans = planCarousel(slides, { template: "process", brand });
    expect(plans.flatMap((p) => p.issues)).toEqual([]);
    expect(plans[3]!.elements.filter((e) => e.kind === "arrow")).toHaveLength(2);
    expect(MAX_WORDS).toBe(25);
  });

  it("orders diagram nodes along the edges", () => {
    const ordered = orderNodes({
      nodes: [{ id: "c", label: "C" }, { id: "a", label: "A" }, { id: "b", label: "B" }],
      edges: [{ from: "a", to: "b", label: null }, { from: "b", to: "c", label: null }],
    });
    expect(ordered.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});
