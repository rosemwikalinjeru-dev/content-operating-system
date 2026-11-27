import { describe, expect, it } from "vitest";
import { buildReport } from "./report";

const base = { prompt: { name: "r", version: 1, hash: "h" }, model: "m", ran_at: "t" };

describe("editorial eval report", () => {
  it("passes only with a clear gap, consistent wins and enough owner posts", () => {
    const owner = Array.from({ length: 10 }, (_, i) => ({ id: `o${i}`, group: "owner" as const, score: 70 + i }));
    const generic = Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, group: "generic" as const, score: 30 + i }));
    const r = buildReport({ ...base, scores: [...owner, ...generic] });
    expect(r.gap).toBe(41);
    expect(r.pairwise).toBe(1);
    expect(r.passed).toBe(true);
  });

  it("fails with too few owner posts even when the gap is large, and says why", () => {
    const r = buildReport({
      ...base,
      scores: [
        { id: "o", group: "owner", score: 90 },
        { id: "g", group: "generic", score: 20 },
      ],
    });
    expect(r.passed).toBe(false);
    expect(r.notes[0]).toMatch(/Only 1 owner posts/);
  });

  it("counts ties as half a win", () => {
    const r = buildReport({ ...base, scores: [{ id: "o", group: "owner", score: 50 }, { id: "g", group: "generic", score: 50 }] });
    expect(r.pairwise).toBe(0.5);
  });
});
