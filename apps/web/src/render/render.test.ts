import { ROSE_NJERU_DEFAULTS, type DesignSlide } from "@contentos/schemas";
import { planCarousel } from "@contentos/visual";
import { writeFileSync, mkdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { slidesToPdf, slidesToZip } from "./export";
import { renderSlidePng } from "./render";

const brand = { name: "Rose Njeru Automation", brand_guidelines: ROSE_NJERU_DEFAULTS.brand_guidelines } as never;
const base = { kicker: null, body: null, items: [], before: null, after: null, emphasis: [], visual: { type: "none" as const } };
const slides: DesignSlide[] = [
  { ...base, id: "d1", layout: "cover", kicker: "Quotes", headline: "Your quote went out on Tuesday. Nobody followed up.", emphasis: ["Nobody"], body: "Where the job was lost" },
  { ...base, id: "d2", layout: "list", headline: "Where the week went", items: ["Details typed in twice", "Price checked by memory", "Reply sent on Friday"] },
  { ...base, id: "d3", layout: "before_after", headline: "One handoff, two weeks", before: "Client details retyped into three tools", after: "Captured once and carried through" },
  {
    ...base,
    id: "d4",
    layout: "diagram",
    headline: "Follow one enquiry",
    body: "Every box is a place it can stall.",
    visual: { type: "diagram", diagram: { nodes: [{ id: "a", label: "Enquiry" }, { id: "b", label: "Quote" }, { id: "c", label: "Follow-up" }, { id: "d", label: "Booking" }], edges: [{ from: "a", to: "b", label: null }, { from: "b", to: "c", label: null }, { from: "c", to: "d", label: null }] } },
  },
  { ...base, id: "d5", layout: "closing", headline: "This week, count the quotes with no second message.", body: "[your number]" },
];

describe("slide renderer", () => {
  it("renders 1:1 slides at 1080×1080 with the same content and no readability issues", { timeout: 60_000 }, async () => {
    const plans = planCarousel(slides, { template: "statement", brand, aspect: "1:1" });
    expect(plans.flatMap((p) => p.issues)).toEqual([]);
    const pngs = await Promise.all(plans.map((p) => renderSlidePng(p)));
    for (const png of pngs) {
      const view = new DataView(png.buffer, png.byteOffset);
      expect([view.getUint32(16), view.getUint32(20)]).toEqual([1080, 1080]);
    }
    if (process.env.RENDER_OUT) pngs.forEach((png, i) => writeFileSync(`${process.env.RENDER_OUT}/square-${i + 1}.png`, png));
    const pdf = await slidesToPdf(pngs, { width: 1080, height: 1080 });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });

  it("renders 1080×1350 PNGs and assembles the PDF and ZIP", { timeout: 60_000 }, async () => {
    for (const template of ["statement", "process"] as const) {
      const plans = planCarousel(slides, { template, brand });
      expect(plans.flatMap((p) => p.issues)).toEqual([]);
      const pngs = await Promise.all(plans.map((p) => renderSlidePng(p)));
      for (const png of pngs) {
        expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
        const view = new DataView(png.buffer, png.byteOffset);
        expect([view.getUint32(16), view.getUint32(20)]).toEqual([1080, 1350]);
      }
      if (process.env.RENDER_OUT) {
        mkdirSync(process.env.RENDER_OUT, { recursive: true });
        pngs.forEach((png, i) => writeFileSync(`${process.env.RENDER_OUT}/${template}-${i + 1}.png`, png));
      }
      const pdf = await slidesToPdf(pngs);
      expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
      const zip = slidesToZip(pngs, pdf, "readme");
      expect([...zip.slice(0, 2)]).toEqual([0x50, 0x4b]);
    }
  });
});
