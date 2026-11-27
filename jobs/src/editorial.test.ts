import type { UsageController } from "@contentos/provider-gateway";
import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({
  loadJob: vi.fn(),
  updateJob: vi.fn(),
  beginStep: vi.fn(),
  finishStep: vi.fn(),
  sumSpend: vi.fn(),
  ensurePromptTemplate: vi.fn(),
  loadSettings: vi.fn(),
  defaultBrandId: vi.fn(),
  loadUnusedEdits: vi.fn(),
  loadUnusedRejections: vi.fn(),
  loadAllRules: vi.fn(),
  insertRuleProposals: vi.fn(),
  markUsedForRules: vi.fn(),
}));
vi.mock("@contentos/database/service", () => svc);

const { runProposeRules } = await import("./editorial");

const USER = "11111111-1111-4111-8111-111111111111";
const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };

function controller(rules: Array<{ rule: string; rationale: string; evidence_refs: string[] }>) {
  return {
    generate: vi.fn(async () => ({ output: { rules }, provider: "anthropic", model: "claude-haiku-5-5", usage, costUsd: 0.001, durationMs: 1 })),
    estimate: vi.fn(() => 0.001),
  } as unknown as UsageController & { generate: ReturnType<typeof vi.fn> };
}
const deps = (c: UsageController) => ({ db: {} as never, controller: c, logger: silent });

beforeEach(() => {
  vi.clearAllMocks();
  svc.loadJob.mockResolvedValue({ id: "job-1", user_id: USER, job_type: "propose_rules", status: "queued", project_id: null, input: {}, budget_limit_usd: null });
  svc.defaultBrandId.mockResolvedValue("brand-1");
  svc.loadSettings.mockResolvedValue({ budget_text_project_usd: 0.5, budget_daily_usd: 5, budget_monthly_usd: 50, model_routes: {} });
  svc.loadAllRules.mockResolvedValue(["Never open with a question."]);
  svc.ensurePromptTemplate.mockResolvedValue("tmpl-1");
  svc.beginStep.mockResolvedValue({ step: { id: "step-1", status: "running", input_hash: "h", output: null, attempt: 1 }, reusable: false });
  svc.loadUnusedRejections.mockResolvedValue([]);
  svc.insertRuleProposals.mockImplementation(async (_db, _u, _b, rows: unknown[]) => rows.length);
});

describe("propose_rules pipeline", () => {
  it("does nothing (no model call) when there is nothing new to learn from", async () => {
    svc.loadUnusedEdits.mockResolvedValue([]);
    const c = controller([]);
    await runProposeRules(deps(c), "job-1", { finalAttempt: false });
    expect(c.generate).not.toHaveBeenCalled();
    expect(svc.updateJob).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ status: "completed" }));
  });

  it("proposes rules backed by real edits, drops duplicates and ones without evidence, and marks edits used", async () => {
    svc.loadUnusedEdits.mockResolvedValue([{ id: "v-1", edits: [{ key: "s1", before: "our customers", after: "our clients" }] }]);
    const c = controller([
      { rule: "Say clients, not customers.", rationale: "Replaced every time.", evidence_refs: ["e1"] },
      { rule: "never open with a question.", rationale: "dup", evidence_refs: ["e1"] },
      { rule: "Use more emojis.", rationale: "made up", evidence_refs: ["e42"] },
    ]);
    await runProposeRules(deps(c), "job-1", { finalAttempt: false });
    expect(c.generate.mock.calls[0]![0].task).toBe("rule_proposal");
    const rows = svc.insertRuleProposals.mock.calls[0]![3];
    expect(rows).toEqual([
      { rule: "Say clients, not customers.", rationale: "Replaced every time.", evidence: [{ before: "our customers", after: "our clients" }], source: "edits" },
    ]);
    expect(svc.markUsedForRules).toHaveBeenCalledWith(expect.anything(), USER, ["v-1"], []);
  });
});
