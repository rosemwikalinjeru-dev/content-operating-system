import { ProviderError, type UsageController } from "@contentos/provider-gateway";
import { ROSE_NJERU_DEFAULTS } from "@contentos/schemas";
import { AppError } from "@contentos/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({
  loadJob: vi.fn(),
  updateJob: vi.fn(),
  beginStep: vi.fn(),
  finishStep: vi.fn(),
  loadIdea: vi.fn(),
  loadBrand: vi.fn(),
  loadSettings: vi.fn(),
  loadVoiceExamples: vi.fn(),
  searchKnowledge: vi.fn(),
  ensurePromptTemplate: vi.fn(),
  saveIdeaAnalysis: vi.fn(),
  loadProject: vi.fn(),
  insertBrief: vi.fn(),
  sumSpend: vi.fn(),
}));
vi.mock("@contentos/database/service", () => svc);

const { runAnalyzeIdea, runGenerateBrief, NonRetryableJobError } = await import("./pipeline");

const USER = "11111111-1111-4111-8111-111111111111";
const IDEA = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const brand = { id: "brand-1", is_default: true, status: "active", created_at: "", updated_at: "t1", ...ROSE_NJERU_DEFAULTS };
const analysisOutput = {
  summary: "s",
  core_argument: "c",
  claims: [],
  missing_information: [],
  genericity: { is_generic: false, reason: "r", sharpening_questions: [] },
  audience_fit: "a",
  suggested_angles: [],
  related_knowledge_ids: [],
  recommended_next_step: "create_brief",
};
const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };

function controller(generate: UsageController["generate"]) {
  return {
    generate: vi.fn(generate),
    estimate: vi.fn(() => 0.05),
    route: vi.fn(() => ({ provider: "anthropic", model: "claude-opus-5-5", effort: "medium", maxTokens: 8000, expectedOutputTokens: 1000 })),
  } as unknown as UsageController & { generate: ReturnType<typeof vi.fn> };
}

const okAnalysis = () =>
  controller(async () => ({ output: analysisOutput, provider: "anthropic", model: "claude-opus-5-5", usage, costUsd: 0.04, durationMs: 1 }) as never);

beforeEach(() => {
  vi.clearAllMocks();
  svc.loadJob.mockResolvedValue({ id: "job-1", user_id: USER, job_type: "analyze_idea", status: "queued", project_id: null, input: { idea_id: IDEA }, budget_limit_usd: null });
  svc.loadIdea.mockResolvedValue({ id: IDEA, brand_id: "brand-1", title: "Missed calls", raw_input: "Nobody calls back", status: "inbox", analysis: null, analysis_input_hash: null });
  svc.loadBrand.mockResolvedValue(brand);
  svc.loadSettings.mockResolvedValue({ budget_text_project_usd: 0.5, budget_media_project_usd: 3, budget_daily_usd: 5, budget_monthly_usd: 50 });
  svc.loadVoiceExamples.mockResolvedValue([{ id: "k1", kind: "example_post", title: "t", body: "b" }]);
  svc.searchKnowledge.mockResolvedValue([]);
  svc.ensurePromptTemplate.mockResolvedValue("tmpl-1");
  svc.beginStep.mockResolvedValue({ step: { id: "step-1", status: "running", input_hash: "h", output: null, attempt: 1 }, reusable: false });
  svc.sumSpend.mockResolvedValue(0.04);
});

const deps = (c: UsageController) => ({ db: {} as never, controller: c, logger: silent });

describe("analyze_idea pipeline", () => {
  it("analyses, saves the result, records the step and completes the job with its cost", async () => {
    const c = okAnalysis();
    await runAnalyzeIdea(deps(c), "job-1", { finalAttempt: false });
    expect(c.generate).toHaveBeenCalledWith(
      expect.objectContaining({ task: "idea_analysis" }),
      { userId: USER, jobId: "job-1", stepId: "step-1", promptTemplateId: "tmpl-1" },
      { dailyUsd: 5, monthlyUsd: 50, jobUsd: null },
    );
    expect(svc.saveIdeaAnalysis).toHaveBeenCalledWith({}, USER, IDEA, analysisOutput, expect.stringMatching(/^[0-9a-f]{64}$/));
    expect(svc.finishStep).toHaveBeenCalledWith({}, expect.anything(), "step-1", expect.objectContaining({ status: "completed", cost: 0.04 }));
    expect(svc.updateJob).toHaveBeenLastCalledWith({}, expect.anything(), expect.objectContaining({ status: "completed", progress: 100, actual_cost: 0.04 }));
  });

  it("reuses a completed step with identical inputs instead of paying again (resume)", async () => {
    svc.beginStep.mockResolvedValue({ step: { id: "step-1", status: "completed", input_hash: "h", output: { idea_id: IDEA }, attempt: 1 }, reusable: true });
    const c = okAnalysis();
    await runAnalyzeIdea(deps(c), "job-1", { finalAttempt: false });
    expect(c.generate).not.toHaveBeenCalled();
    expect(svc.updateJob).toHaveBeenLastCalledWith({}, expect.anything(), expect.objectContaining({ status: "completed" }));
  });

  it("produces the same input hash for the same inputs and a new one when the idea changes", async () => {
    await runAnalyzeIdea(deps(okAnalysis()), "job-1", { finalAttempt: false });
    const h1 = svc.beginStep.mock.calls[0]![2].inputHash;
    await runAnalyzeIdea(deps(okAnalysis()), "job-1", { finalAttempt: false });
    expect(svc.beginStep.mock.calls[1]![2].inputHash).toBe(h1);
    svc.loadIdea.mockResolvedValue({ id: IDEA, brand_id: "brand-1", title: "Missed calls", raw_input: "Edited", status: "inbox", analysis: null, analysis_input_hash: null });
    await runAnalyzeIdea(deps(okAnalysis()), "job-1", { finalAttempt: false });
    expect(svc.beginStep.mock.calls[2]![2].inputHash).not.toBe(h1);
  });

  it("stops without retrying when the budget is exceeded, and fails the job with the reason", async () => {
    const c = controller(async () => {
      throw new AppError("BUDGET_EXCEEDED", "Daily budget reached.");
    });
    await expect(runAnalyzeIdea(deps(c), "job-1", { finalAttempt: false })).rejects.toBeInstanceOf(NonRetryableJobError);
    expect(svc.updateJob).toHaveBeenLastCalledWith(
      {},
      expect.anything(),
      expect.objectContaining({ status: "failed", error: { code: "BUDGET_EXCEEDED", message: "Daily budget reached." } }),
    );
    expect(svc.saveIdeaAnalysis).not.toHaveBeenCalled();
  });

  it("keeps the job running for a retryable provider error, and fails it on the final attempt", async () => {
    const failing = () =>
      controller(async () => {
        throw new ProviderError("overloaded", "Provider unavailable", { retryable: true });
      });
    await expect(runAnalyzeIdea(deps(failing()), "job-1", { finalAttempt: false })).rejects.toBeInstanceOf(ProviderError);
    expect(svc.updateJob).toHaveBeenLastCalledWith({}, expect.anything(), expect.objectContaining({ status: "running" }));

    await expect(runAnalyzeIdea(deps(failing()), "job-1", { finalAttempt: true })).rejects.toBeInstanceOf(ProviderError);
    expect(svc.updateJob).toHaveBeenLastCalledWith({}, expect.anything(), expect.objectContaining({ status: "failed" }));
  });

  it("does nothing for an already completed job", async () => {
    svc.loadJob.mockResolvedValue({ id: "job-1", user_id: USER, job_type: "analyze_idea", status: "completed", project_id: null, input: { idea_id: IDEA }, budget_limit_usd: null });
    const c = okAnalysis();
    await runAnalyzeIdea(deps(c), "job-1", { finalAttempt: false });
    expect(c.generate).not.toHaveBeenCalled();
    expect(svc.updateJob).not.toHaveBeenCalled();
  });

  it("refuses a job of the wrong type", async () => {
    svc.loadJob.mockResolvedValue({ id: "job-1", user_id: USER, job_type: "generate_brief", status: "queued", project_id: null, input: {}, budget_limit_usd: null });
    await expect(runAnalyzeIdea(deps(okAnalysis()), "job-1", { finalAttempt: false })).rejects.toBeInstanceOf(NonRetryableJobError);
  });
});

describe("generate_brief pipeline", () => {
  const briefOutput = {
    idea: "i", audience: "a", objective: "authority", content_pillar: "p", core_argument: "c", position: "pos",
    problem: "1", why_it_matters: "2", root_cause: "3", response: "4", technology_role: "none", success_measure: "6",
    supporting_points: [], evidence: [], story_angle: "s", hooks: ["h1", "h2", "h3"], desired_action: "d",
    selected_formats: ["carousel", "short_video"], voice_constraints: [], open_questions: [],
  };

  beforeEach(() => {
    svc.loadJob.mockResolvedValue({ id: "job-2", user_id: USER, job_type: "generate_brief", status: "queued", project_id: PROJECT, input: { project_id: PROJECT, guidance: "Focus on salons" }, budget_limit_usd: null });
    svc.loadProject.mockResolvedValue({ id: PROJECT, brand_id: "brand-1", idea_id: IDEA, title: "P", settings: { formats: ["linkedin"] } });
    svc.insertBrief.mockResolvedValue({ id: "brief-1", version: 1 });
  });

  it("applies the project budget, enforces requested formats and saves a pending brief version", async () => {
    const c = controller(async () => ({ output: briefOutput, provider: "anthropic", model: "claude-opus-5-5", usage, costUsd: 0.1, durationMs: 1 }) as never);
    await runGenerateBrief(deps(c), "job-2", { finalAttempt: false });
    expect(c.generate.mock.calls[0]![2]).toEqual({ dailyUsd: 5, monthlyUsd: 50, projectUsd: 0.5, jobUsd: null });
    expect(c.generate.mock.calls[0]![1]).toMatchObject({ projectId: PROJECT, jobId: "job-2" });
    expect(c.generate.mock.calls[0]![0].messages[0].content).toContain("Focus on salons");
    const saved = svc.insertBrief.mock.calls[0]![2];
    expect(saved.brief.selected_formats).toEqual(["linkedin"]);
    expect(saved).toMatchObject({ projectId: PROJECT, model: "claude-opus-5-5", promptTemplateId: "tmpl-1", jobId: "job-2" });
  });

  it("uses a saved analysis only if it is valid", async () => {
    svc.loadIdea.mockResolvedValue({ id: IDEA, brand_id: "brand-1", title: "t", raw_input: "r", status: "inbox", analysis: { broken: true }, analysis_input_hash: null });
    const c = controller(async () => ({ output: briefOutput, provider: "anthropic", model: "m", usage, costUsd: 0.1, durationMs: 1 }) as never);
    await runGenerateBrief(deps(c), "job-2", { finalAttempt: false });
    expect(c.generate.mock.calls[0]![0].messages[0].content).not.toContain("Idea analysis:");
  });
});
