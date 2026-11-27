import { describe, expect, it } from "vitest";
import { CarouselSlides, fromModelSlide, renumber, toDesignSlides, type DesignOutput } from "./visual";

const m = (p: Partial<DesignOutput["slides"][number]>): DesignOutput["slides"][number] => ({
  layout: "statement",
  kicker: null,
  headline: "Headline here",
  body: null,
  items: [],
  before: null,
  after: null,
  emphasis: [],
  diagram: null,
  wants_screenshot: false,
  ...p,
});

describe("model output to slides", () => {
  it("assigns ids in order and keeps only fields the layout uses", () => {
    const slides = toDesignSlides({
      slides: [m({ layout: "cover", items: ["ignored"] }), m({ layout: "list", items: [" A ", "", "B"] }), m({ layout: "closing", before: "ignored" })],
    });
    expect(slides.map((s) => s.id)).toEqual(["d1", "d2", "d3"]);
    expect(slides[0]!.items).toEqual([]);
    expect(slides[1]!.items).toEqual(["A", "B"]);
    expect(slides[2]!.before).toBeNull();
    expect(CarouselSlides.safeParse(slides).success).toBe(true);
  });

  it("drops emphasis words that are not in the headline", () => {
    expect(fromModelSlide(m({ headline: "Nobody followed up", emphasis: ["Nobody", "invented"] }), "d1").emphasis).toEqual(["Nobody"]);
  });

  it("keeps a valid diagram and falls back to a statement when the diagram is unusable", () => {
    const ok = fromModelSlide(m({ layout: "diagram", diagram: { nodes: [{ id: "a", label: "Enquiry" }, { id: "b", label: "Quote" }], edges: [{ from: "a", to: "b", label: null }] } }), "d2");
    expect(ok.visual.type).toBe("diagram");
    const bad = fromModelSlide(m({ layout: "diagram", diagram: { nodes: [{ id: "a", label: "Only one" }], edges: [] } }), "d2");
    expect(bad.layout).toBe("statement");
    expect(bad.visual.type).toBe("none");
  });

  it("marks slides that want the owner's screenshot without inventing one", () => {
    expect(fromModelSlide(m({ wants_screenshot: true }), "d3").visual).toEqual({ type: "screenshot", media_id: null, caption: null });
  });

  it("renumbers after reordering", () => {
    const slides = toDesignSlides({ slides: [m({}), m({}), m({})] });
    expect(renumber([slides[2]!, slides[0]!, slides[1]!]).map((s) => s.id)).toEqual(["d1", "d2", "d3"]);
  });
});
