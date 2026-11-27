import type { UsageController } from "@contentos/provider-gateway";
import { ROSE_NJERU_DEFAULTS } from "@contentos/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({
  loadJob: vi.fn(),
  updateJob: vi.fn(),
  beginStep: vi.fn(),
  finishStep: vi.fn(),
  sumSpend: vi.fn(),
  ensurePromptTemplate: vi.fn(),
  loadSettings: vi.fn(),
  loadBrand: vi.fn(),
  loadProject: vi.fn(),
  loadAsset: vi.fn(),
  loadNarrativeVersion: vi.fn(),
  loadDesign: vi.fn(),
  addDesign: vi.fn(),
}));
vi.mock("@contentos/database/service", () => svc);

const { runDesignCarousel, runReviseSlide } = await import("./visual");
const { NonRetryableJobError } = await import("./pipeline");

const USER = "11111111-1111-4111-8111-111111111111";
const ASSET = "55555555-5555-4555-8555-555555555555";
const DESIGN = "66666666-6666-4666-8666-666666666666";
const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const slide = (layout: string, headline: string) => ({ layout, kicker: null, headline, body: null, items: [], before: null, after: null, emphasis: [], diagram: null, wants_screenshot: false });

function controller() {
  return {
    generate: vi.fn(async (req: { task: string }) => ({
      output:
        req.task === "visual_direction"
          ? { template: "statement", slides: [slide("cover", "Hook"), slide("statement", "Middle"), slide("closing", "End")], word_changes: ["Shortened slide 2"] }
          : { ...slide("closing", "Revised middle"), note: "Tighter." },
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      usage,
      costUsd: 0.01,
      durationMs: 1,
    })),
    estimate: vi.fn(() => 0.01),
  } as unknown as UsageController & { generate: ReturnType<typeof vi.fn> };
}
const deps = (c: UsageController) => ({ db: {} as never, controller: c, logger: silent });

beforeEach(() => {
  vi.clearAllMocks();
  svc.loadSettings.mockResolvedValue({ budget_text_project_usd: 0.5, budget_daily_usd: 5, budget_monthly_usd: 50, model_routes: {} });
  svc.loadBrand.mockResolvedValue({ id: "brand-1", is_default: true, status: "active", created_at: "", updated_at: "t", ...ROSE_NJERU_DEFAULTS });
  svc.loadProject.mockResolvedValue({ id: "p1", brand_id: "brand-1", idea_id: null, title: "P", settings: {} });
  svc.loadAsset.mockResolvedValue({ id: ASSET, project_id: "p1", brief_id: null, platform: "linkedin", format: "carousel" });
  svc.ensurePromptTemplate.mockResolvedValue("tmpl-1");
  svc.beginStep.mockResolvedValue({ step: { id: "step-1", status: "running", input_hash: "h", output: null, attempt: 1 }, reusable: false });
  svc.addDesign.mockResolvedValue({ id: "new-design", version: 2 });
});

describe("design_carousel pipeline", () => {
  beforeEach(() => {
    svc.loadJob.mockResolvedValue({ id: "job-1", user_id: USER, job_type: "design_carousel", status: "queued", input: { asset_id: ASSET }, budget_limit_usd: null });
    svc.loadNarrativeVersion.mockResolvedValue({
      version: 3,
      body: { format: "carousel", sections: [{ key: "s1", kind: "hook", text: "Hook", headline: "Hook" }, { key: "s2", kind: "cta", text: "End", headline: null }], single_point: "p" },
    });
  });

  it("designs from the narrative and records word changes on the new version", async () => {
    const c = controller();
    await runDesignCarousel(deps(c), "job-1", { finalAttempt: false });
    expect(c.generate.mock.calls[0]![0].task).toBe("visual_direction");
    const saved = svc.addDesign.mock.calls[0]![1];
    expect(saved).toMatchObject({ assetId: ASSET, sourceVersion: 3, template: "statement", createdBy: "ai", model: "claude-sonnet-5-5" });
    expect(saved.slides.map((s: { id: string }) => s.id)).toEqual(["d1", "d2", "d3"]);
    expect(saved.changeNote).toContain("Shortened slide 2");
  });

  it("refuses assets that are not carousels", async () => {
    svc.loadAsset.mockResolvedValue({ id: ASSET, project_id: "p1", brief_id: null, platform: "linkedin", format: "post" });
    await expect(runDesignCarousel(deps(controller()), "job-1", { finalAttempt: false })).rejects.toBeInstanceOf(NonRetryableJobError);
  });
});

describe("revise_slide pipeline", () => {
  beforeEach(() => {
    svc.loadJob.mockResolvedValue({ id: "job-2", user_id: USER, job_type: "revise_slide", status: "queued", input: { design_id: DESIGN, slide: "d2", instruction: "Tighter" }, budget_limit_usd: null });
    const base = { kicker: null, body: null, items: [], before: null, after: null, emphasis: [], visual: { type: "none" } };
    svc.loadDesign.mockResolvedValue({
      id: DESIGN,
      asset_id: ASSET,
      version: 1,
      source_version: 3,
      template: "statement",
      slides: [
        { ...base, id: "d1", layout: "cover", headline: "Hook" },
        { ...base, id: "d2", layout: "statement", headline: "Middle" },
        { ...base, id: "d3", layout: "closing", headline: "End" },
      ],
    });
  });

  it("changes only the target slide and never turns a middle slide into a closing slide", async () => {
    await runReviseSlide(deps(controller()), "job-2", { finalAttempt: false });
    const saved = svc.addDesign.mock.calls[0]![1];
    expect(saved.slides.map((s: { headline: string }) => s.headline)).toEqual(["Hook", "Revised middle", "End"]);
    // The model asked for "closing" in the middle; the slide keeps its own layout.
    expect(saved.slides[1].layout).toBe("statement");
    expect(saved).toMatchObject({ parentVersion: 1, changeNote: "d2: Tighter." });
  });
});
