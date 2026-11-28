/**
 * Motion graphics timeline (calm style, owner choice 2026-11-28). Pure: given a slide plan and a
 * time, returns how each element looks. The browser draws frames from this and encodes MP4.
 *
 * Per slide: background is there from the start; the kicker, headline, body and cards ease up
 * and fade in, staggered; diagram boxes appear one by one with their arrows drawing between
 * them; highlighted words light up after the headline settles; the footer is static. Each
 * slide holds for reading, then fades out into the next.
 */
import type { PlanEl, SlidePlan } from "./plan";

export const FPS = 30;
const ENTER = 0.5; // seconds for one element to ease in
const STAGGER = 0.18; // seconds between elements
const HOLD = 2.2; // seconds of stillness for reading after everything is in
const EXIT = 0.35; // fade-out at the end of a slide
export const MAX_SLIDE_SECONDS = 6;

export interface ElementState {
  opacity: number;
  /** Upward offset in pixels (eases from 24 to 0). */
  dy: number;
  /** 0–1: how much of an arrow is drawn. */
  progress: number;
  /** Highlighted words use the accent colour once this is true. */
  emphasisOn: boolean;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const clamp = (t: number) => Math.max(0, Math.min(1, t));

function isStatic(el: PlanEl): boolean {
  return el.kind === "text" && Boolean(el.decorative);
}

/** When each element starts entering, in seconds from the start of the slide. */
export function entranceTimes(plan: SlidePlan): number[] {
  let slot = 0;
  return plan.elements.map((el) => {
    if (isStatic(el)) return 0;
    // A card's label and text enter with their card; node text with its box.
    const prev = plan.elements[plan.elements.indexOf(el) - 1];
    const joinsPrevious = el.kind === "text" && prev?.kind === "rect" && el.y >= prev.y && el.y < prev.y + prev.h;
    if (!joinsPrevious && plan.elements.indexOf(el) > 0) slot += 1;
    return 0.25 + slot * STAGGER;
  });
}

export function slideDuration(plan: SlidePlan): number {
  const last = Math.max(0, ...entranceTimes(plan));
  return Math.min(MAX_SLIDE_SECONDS, last + ENTER + HOLD + EXIT);
}

export function frameState(plan: SlidePlan, t: number): { states: ElementState[]; fade: number } {
  const duration = slideDuration(plan);
  const starts = entranceTimes(plan);
  const headlineSettled = Math.max(...plan.elements.map((el, i) => (el.kind === "text" && el.part === "headline" ? starts[i]! + ENTER : 0)));
  const states = plan.elements.map((el, i): ElementState => {
    if (isStatic(el)) return { opacity: 1, dy: 0, progress: 1, emphasisOn: true };
    const p = easeOut(clamp((t - starts[i]!) / ENTER));
    if (el.kind === "arrow") return { opacity: p > 0 ? 1 : 0, dy: 0, progress: p, emphasisOn: true };
    return { opacity: p, dy: el.kind === "text" ? 24 * (1 - p) : 12 * (1 - p), progress: 1, emphasisOn: t >= headlineSettled + 0.15 };
  });
  // The whole slide fades out at the end (into the next slide's background).
  const fade = 1 - clamp((t - (duration - EXIT)) / EXIT);
  return { states, fade };
}

/** Frame schedule for a whole carousel: which slide and local time each frame shows. */
export function schedule(plans: SlidePlan[], fps = FPS): Array<{ slide: number; t: number }> {
  const frames: Array<{ slide: number; t: number }> = [];
  plans.forEach((plan, slide) => {
    const n = Math.round(slideDuration(plan) * fps);
    for (let f = 0; f < n; f++) frames.push({ slide, t: f / fps });
  });
  return frames;
}
