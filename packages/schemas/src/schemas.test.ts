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

  it("normalises empty or malformed stored JSON", () => {
    const n = normaliseBrand({ audience: {}, voice_profile: { tone: "not-an-array" }, brand_guidelines: null });
    expect(n.voice_profile.tone).toEqual([]);
    expect(n.audience.segments).toEqual([]);
    expect(n.brand_guidelines.colors).toEqual({});
  });
});
