import { ROSE_NJERU_DEFAULTS, type DesignSlide } from "@contentos/schemas";
import { describe, expect, it } from "vitest";
import { FPS, frameState, MAX_SLIDE_SECONDS, schedule, slideDuration } from "./motion";
import { planSlide } from "./plan";

const brand = { name: "Rose Njeru Automation", brand_guidelines: ROSE_NJERU_DEFAULTS.brand_guidelines } as never;
const base = { kicker: "Quotes", body: "Where the job was lost", items: [], before: null, after: null, emphasis: ["Nobody"], visual: { type: "none" as const } };
const plan = planSlide({ ...base, id: "d1", layout: "cover", headline: "Nobody followed up." } as DesignSlide, { template: "statement", brand, index: 0, total: 3 });

describe("motion timeline", () => {
  it("starts with only the static footer visible and ends with everything in place before fading out", () => {
    const first = frameState(plan, 0);
    plan.elements.forEach((el, i) => {
      const s = first.states[i]!;
      if (el.kind === "text" && el.decorative) expect(s.opacity).toBe(1);
      else expect(s.opacity).toBe(0);
    });
    const d = slideDuration(plan);
    const settled = frameState(plan, d - 0.5);
    expect(settled.states.every((s) => s.opacity === 1 && s.dy === 0)).toBe(true);
    expect(settled.fade).toBe(1);
    expect(frameState(plan, d).fade).toBe(0);
  });

  it("staggers entrances and lights up highlighted words after the headline settles", () => {
    const headline = plan.elements.findIndex((e) => e.kind === "text" && e.part === "headline");
    const body = plan.elements.findIndex((e) => e.kind === "text" && e.part === "body");
    const mid = frameState(plan, 0.5);
    expect(mid.states[headline]!.opacity).toBeGreaterThan(mid.states[body]!.opacity);
    expect(frameState(plan, 0.3).states[headline]!.emphasisOn).toBe(false);
    expect(frameState(plan, 2).states[headline]!.emphasisOn).toBe(true);
  });

  it("keeps slides calm and bounded, and schedules frames for the whole carousel", () => {
    expect(slideDuration(plan)).toBeGreaterThan(2.5);
    expect(slideDuration(plan)).toBeLessThanOrEqual(MAX_SLIDE_SECONDS);
    const frames = schedule([plan, plan]);
    expect(frames.length).toBe(2 * Math.round(slideDuration(plan) * FPS));
    expect(frames[0]).toEqual({ slide: 0, t: 0 });
  });
});
