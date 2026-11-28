import { ProviderError, type UsageController } from "@contentos/provider-gateway";
import { ROSE_NJERU_DEFAULTS, toDraftBody } from "@contentos/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({
  defaultBrandId: vi.fn(async () => "brand-1"),
  loadNicheCorpus: vi.fn(async () => []),
  loadRecentBodies: vi.fn(async () => []),
  loadJob: vi.fn(),
  updateJob: vi.fn(),
  beginStep: vi.fn(),
  finishStep: vi.fn(),
  loadBrand: vi.fn(),
  loadSettings: vi.fn(),
  loadVoiceExamples: vi.fn(),
  searchKnowledge: vi.fn(),
  ensurePromptTemplate: vi.fn(),
  loadProject: vi.fn(),
  sumSpend: vi.fn(),
  loadBrief: vi.fn(),
  ensureAsset: vi.fn(),
  findAsset: vi.fn(),
  versionByInputHash: vi.fn(),
  addVersion: vi.fn(),
  markProjectInProduction: vi.fn(),
  loadAsset: vi.fn(),
  loadVersion: vi.fn(),
  loadApprovedRules: vi.fn(),
  loadVersionById: vi.fn(),
  loadVerifiedKnowledgeText: vi.fn(),
  loadApprovedBodies: vi.fn(),
  insertReview: vi.fn(),
  insertSuggestions: vi.fn(),
}));
vi.mock("@contentos/database/service", () => svc);

const { runWriteContent, runReviseSection } = await import("./writing");
const { NonRetryableJobError } = await import("./pipeline");

const USER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const BRIEF = "44444444-4444-4444-8444-444444444444";
const ASSET = "55555555-5555-4555-8555-555555555555";
const brand = { id: "brand-1", is_default: true, status: "active", created_at: "", updated_at: "t1", ...ROSE_NJERU_DEFAULTS };
const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
const brief = {
  idea: "i", funnel_stage: "authority", single_point: "Missed calls are a routing problem.", audience: "a", objective: "authority",
  content_pillar: "p", core_argument: "c", position: "p", problem: "p", why_it_matters: "w", root_cause: "r", response: "r",
  technology_role: "none", success_measure: "m", supporting_points: [], evidence: [], story_angle: "s", hooks: ["h"],
  desired_action: "d", selected_formats: ["linkedin", "x_thread"], voice_constraints: [], open_questions: [], cover_test: "c",
};
const draft = {
  sections: [
    { kind: "hook", text: "A plumber misses a call at 7am.", headline: null, on_screen: null, broll: null },
    { kind: "closing", text: "Check your [missed calls] today.", headline: null, on_screen: null, broll: null },
  ],
  single_point: "sp",
  cover_test: "ct",
};

function controller(fail?: Error) {
  return {
    generate: vi.fn(async (req: { task: string; messages: Array<{ content: string }> }) => {
      if (fail && req.messages[0]!.content.includes("x thread")) throw fail;
      const output =
        req.task === "section_revision"
          ? { text: "A plumber misses three calls before 8am.", headline: null, on_screen: null, broll: null, note: "Sharper moment." }
          : req.task === "editorial_review"
            ? {
                dimensions: ["hook", "single_point", "story", "voice", "specificity", "craft"].map((dimension) => ({ dimension, score: 4, evidence: "q", reason: "r" })),
                cold_reader: null,
                gates: [],
                suggestions: [{ section: "s1", dimension: "hook", issue: "Sharper", text: "New hook", headline: null, on_screen: null, broll: null }, { section: "s9", dimension: "hook", issue: "Bad key", text: "x", headline: null, on_screen: null, broll: null }],
              }
            : draft;
      return { output, provider: "anthropic", model: "claude-sonnet-5-5", usage, costUsd: 0.02, durationMs: 1 };
    }),
    estimate: vi.fn(() => 0.02),
  } as unknown as UsageController & { generate: ReturnType<typeof vi.fn> };
}

const deps = (c: UsageController) => ({ db: {} as never, controller: c, logger: silent });

beforeEach(() => {
  vi.clearAllMocks();
  svc.loadJob.mockResolvedValue({
    id: "job-1", user_id: USER, job_type: "write_content", status: "queued", project_id: PROJECT,
    input: { project_id: PROJECT, brief_id: BRIEF, formats: ["linkedin", "x_thread"], force: false }, budget_limit_usd: null,
  });
  svc.loadBrief.mockResolvedValue({ id: BRIEF, project_id: PROJECT, version: 2, brief, approval_status: "approved" });
  svc.loadProject.mockResolvedValue({ id: PROJECT, brand_id: "brand-1", idea_id: null, title: "Missed calls", settings: {} });
  svc.loadBrand.mockResolvedValue(brand);
  svc.loadSettings.mockResolvedValue({ budget_text_project_usd: 0.5, budget_media_project_usd: 3, budget_daily_usd: 5, budget_monthly_usd: 50, model_routes: {} });
  svc.loadVoiceExamples.mockResolvedValue([]);
  svc.searchKnowledge.mockResolvedValue([]);
  svc.ensurePromptTemplate.mockResolvedValue("tmpl-1");
  svc.beginStep.mockImplementation(async (_db: unknown, _job: unknown, step: { name: string }) => ({
    step: { id: `step-${step.name}`, status: "running", input_hash: "h", output: null, attempt: 1 },
    reusable: false,
  }));
  svc.ensureAsset.mockImplementation(async (_db: unknown, _u: string, i: { format: string }) => `asset-${i.format}`);
  svc.findAsset.mockImplementation(async (_db: unknown, _u: string, i: { format: string }) => `asset-${i.format}`);
  svc.versionByInputHash.mockResolvedValue(null);
  svc.addVersion.mockResolvedValue({ id: "v-1", version: 1 });
  svc.sumSpend.mockResolvedValue(0.04);
  svc.loadApprovedRules.mockResolvedValue(["Say clients, not customers."]);
  svc.loadVerifiedKnowledgeText.mockResolvedValue("");
  svc.loadApprovedBodies.mockResolvedValue([]);
  svc.insertReview.mockResolvedValue("review-1");
  svc.loadVersionById.mockImplementation(async (_db: unknown, _u: string, id: string) => ({
    id, asset_id: ASSET, version: 1, body: toDraftBody("linkedin", draft as never), created_by: "ai",
  }));
  svc.loadAsset.mockResolvedValue({ id: ASSET, project_id: PROJECT, brief_id: BRIEF, platform: "linkedin", format: "post" });
});

describe("write_content pipeline", () => {
  it("writes each format in its own step from the approved brief and stores keyed sections", async () => {
    const c = controller();
    await runWriteContent(deps(c), "job-1", { finalAttempt: false });
    // Two writers, then an independent review of each new draft.
    expect(c.generate.mock.calls.map((call) => call[0].task).sort()).toEqual(["editorial_review", "editorial_review", "format_writing", "format_writing"]);
    expect(svc.beginStep.mock.calls.map((call) => call[2].name).sort()).toEqual(["review_linkedin", "review_x_thread", "write_linkedin", "write_x_thread"]);
    // Approved learned rules reach the writer.
    expect(c.generate.mock.calls.find((call) => call[0].task === "format_writing")![0].system).toContain("Say clients, not customers.");
    // Suggestions for sections that do not exist are dropped.
    expect(svc.insertSuggestions.mock.calls[0]![2]).toHaveLength(1);
    expect(svc.insertReview.mock.calls[0]![2]).toMatchObject({ totalScore: 75, gateFailures: [] });
    const body = svc.addVersion.mock.calls[0]![1].body;
    expect(body.sections.map((s: { key: string }) => s.key)).toEqual(["s1", "s2"]);
    expect(body.placeholders).toEqual(["[missed calls]"]);
    expect(svc.addVersion.mock.calls[0]![1]).toMatchObject({ createdBy: "ai", model: "claude-sonnet-5-5", jobId: "job-1" });
    expect(svc.updateJob).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ status: "completed" }));
  });

  it("does not regenerate a format whose inputs are unchanged", async () => {
    svc.versionByInputHash.mockResolvedValue({ id: "v-old", version: 3 });
    const c = controller();
    await runWriteContent(deps(c), "job-1", { finalAttempt: false });
    expect(c.generate).not.toHaveBeenCalled();
    expect(svc.addVersion).not.toHaveBeenCalled();
  });

  it("refuses an unapproved brief without retrying", async () => {
    svc.loadBrief.mockResolvedValue({ id: BRIEF, project_id: PROJECT, version: 2, brief, approval_status: "pending" });
    await expect(runWriteContent(deps(controller()), "job-1", { finalAttempt: false })).rejects.toBeInstanceOf(NonRetryableJobError);
  });

  it("keeps the formats that succeeded when one writer fails, and surfaces a non-retryable failure as final", async () => {
    const c = controller(new ProviderError("refusal", "The model declined.", { retryable: false }));
    await expect(runWriteContent(deps(c), "job-1", { finalAttempt: false })).rejects.toBeInstanceOf(NonRetryableJobError);
    expect(svc.addVersion).toHaveBeenCalledTimes(1);
    expect(svc.finishStep).toHaveBeenCalledWith(expect.anything(), expect.anything(), "step-write_linkedin", expect.objectContaining({ status: "completed" }));
    // The failed format never got an asset row, so no empty tab appears.
    expect(svc.ensureAsset.mock.calls.map((c) => c[2].format)).toEqual(["post"]);
  });
});

describe("revise_section pipeline", () => {
  beforeEach(() => {
    svc.loadJob.mockResolvedValue({
      id: "job-2", user_id: USER, job_type: "revise_section", status: "queued", project_id: PROJECT,
      input: { asset_id: ASSET, version: 1, section: "s1", instruction: "Make the moment sharper" }, budget_limit_usd: null,
    });
    svc.loadAsset.mockResolvedValue({ id: ASSET, project_id: PROJECT, platform: "linkedin", format: "post" });
    svc.loadVersion.mockResolvedValue({ id: "v-1", asset_id: ASSET, version: 1, body: toDraftBody("linkedin", draft as never), input_hash: null, created_by: "ai" });
    svc.addVersion.mockResolvedValue({ id: "v-2", version: 2 });
  });

  it("rewrites only the target section and records its parent", async () => {
    const c = controller();
    await runReviseSection(deps(c), "job-2", { finalAttempt: false });
    expect(c.generate.mock.calls.map((call) => call[0].task)).toEqual(["section_revision", "editorial_review"]);
    expect(c.generate.mock.calls[0]![0].messages[0].content).toContain("Owner's instruction: Make the moment sharper");
    const saved = svc.addVersion.mock.calls[0]![1];
    expect(saved).toMatchObject({ parentVersion: 1, revisedSection: "s1", changeNote: "s1: Sharper moment." });
    expect(saved.body.sections[0].text).toBe("A plumber misses three calls before 8am.");
    expect(saved.body.sections[1].text).toBe("Check your [missed calls] today.");
  });

  it("rejects a section that is not in the version", async () => {
    svc.loadJob.mockResolvedValue({
      id: "job-2", user_id: USER, job_type: "revise_section", status: "queued", project_id: PROJECT,
      input: { asset_id: ASSET, version: 1, section: "s9", instruction: "x y z" }, budget_limit_usd: null,
    });
    await expect(runReviseSection(deps(controller()), "job-2", { finalAttempt: false })).rejects.toThrow(/s9/);
  });
});
