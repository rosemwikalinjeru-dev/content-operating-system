import { describe, expect, it } from "vitest";
import {
  BrandGuidelines,
  BrandProfileCreate,
  BrandProfileUpdate,
  IdeaCreate,
  IdeaListQuery,
  IdeaUpdate,
  ROSE_NJERU_DEFAULTS,
  deriveIdeaTitle,
  normaliseBrand,
} from "./index";

describe("ideas", () => {
  it("normalises tags: lowercase, trimmed, de-duplicated", () => {
    const v = IdeaCreate.parse({ raw_input: " AI won't fix a broken process ", tags: ["AI", " ai ", "Process"] });
    expect(v.tags).toEqual(["ai", "process"]);
    expect(v.raw_input).toBe("AI won't fix a broken process");
  });

  it("rejects empty ideas and oversized input", () => {
    expect(IdeaCreate.safeParse({ raw_input: "   " }).success).toBe(false);
    expect(IdeaCreate.safeParse({ raw_input: "x".repeat(20001) }).success).toBe(false);
  });

  it("rejects empty updates and unknown statuses", () => {
    expect(IdeaUpdate.safeParse({}).success).toBe(false);
    expect(IdeaUpdate.safeParse({ status: "published" }).success).toBe(false);
    expect(IdeaUpdate.parse({ status: "archived" })).toEqual({ status: "archived" });
  });

  it("coerces and bounds list query", () => {
    expect(IdeaListQuery.parse({ limit: "10" }).limit).toBe(10);
    expect(IdeaListQuery.parse({}).limit).toBe(25);
    expect(IdeaListQuery.safeParse({ limit: "1000" }).success).toBe(false);
    expect(IdeaListQuery.safeParse({ brand_id: "nope" }).success).toBe(false);
  });

  it("derives a title from the first line", () => {
    expect(deriveIdeaTitle("Short idea\nmore detail")).toBe("Short idea");
    expect(deriveIdeaTitle("   ")).toBe("Untitled idea");
    const long = deriveIdeaTitle("Businesses are adopting AI without understanding their workflows and that is why automations fail quietly");
    expect(long.length).toBeLessThanOrEqual(81);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("model routes", () => {
  it("reads valid choices and drops invalid ones", async () => {
    const { readModelRoutes, SettingsUpdate } = await import("./index");
    expect(readModelRoutes({ model_routes: { idea_analysis: "claude-haiku-5-5" } })).toEqual({ idea_analysis: "claude-haiku-5-5" });
    expect(readModelRoutes({ model_routes: { idea_analysis: "gpt-5" } })).toEqual({});
    expect(readModelRoutes(null)).toEqual({});
    expect(SettingsUpdate.safeParse({ model_routes: { master_brief: "claude-opus-5-5" } }).success).toBe(true);
    expect(SettingsUpdate.safeParse({ model_routes: { master_brief: "other" } }).success).toBe(false);
  });
});

describe("brand", () => {
  it("accepts the shipped defaults", () => {
    expect(BrandProfileCreate.safeParse(ROSE_NJERU_DEFAULTS).success).toBe(true);
  });

  it("rejects invalid colours and colour keys", () => {
    expect(BrandGuidelines.safeParse({ colors: { teal: "teal" } }).success).toBe(false);
    expect(BrandGuidelines.safeParse({ colors: { "Bad Key": "#000000" } }).success).toBe(false);
  });

  it("requires at least one field on update", () => {
    expect(BrandProfileUpdate.safeParse({}).success).toBe(false);
    expect(BrandProfileUpdate.safeParse({ name: "New" }).success).toBe(true);
  });

  it("upgrades guidelines saved before the messaging fields existed", () => {
    const n = normaliseBrand({ audience: {}, voice_profile: {}, brand_guidelines: { colors: { deep_night: "#1A1A2E" }, fonts: { display: "X" } } });
    expect(n.brand_guidelines.colors.deep_night).toBe("#1A1A2E");
    expect(n.brand_guidelines.messaging.methodology).toEqual([]);
  });

  it("defaults follow v1.0: approved palette and five-stage methodology", () => {
    expect(Object.keys(ROSE_NJERU_DEFAULTS.brand_guidelines.colors).sort()).toEqual(
      ["cobalt", "deep_night", "forest_teal", "ice_blue", "linen_cream", "warm_gold"],
    );
    expect(ROSE_NJERU_DEFAULTS.brand_guidelines.messaging.methodology.map((m) => m.split(":")[0])).toEqual(
      ["Diagnose", "Strategise", "Design", "Implement", "Optimise"],
    );
  });

  it("normalises empty or malformed stored JSON", () => {
    const n = normaliseBrand({ audience: {}, voice_profile: { tone: "not-an-array" }, brand_guidelines: null });
    expect(n.voice_profile.tone).toEqual([]);
    expect(n.audience.segments).toEqual([]);
    expect(n.brand_guidelines.colors).toEqual({});
  });
});
