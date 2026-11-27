/**
 * Job pipelines, independent of Trigger.dev so they can be tested directly.
 *
 * Guarantees:
 *  - Each job loads its owner from the job row; every query is scoped to that user.
 *  - Steps record an input hash. A retried run reuses a completed step with identical inputs
 *    instead of paying for it again (resume after interruption).
 *  - All model calls go through the UsageController (budgets + ledger).
 *  - Failures leave a structured error on the job and the step; completed work is kept.
 */
import { createHash } from "node:crypto";
import * as svc from "@contentos/database/service";
import type { ServiceClient } from "@contentos/database/service";
import {
  buildBriefRequest,
  buildIdeaAnalysisRequest,
  finaliseBrief,
  IDEA_ANALYST,
  STRATEGIST,
  templateHash,
  type PromptTemplate,
} from "@contentos/intelligence";
import { ProviderError, type UsageController } from "@contentos/provider-gateway";
import { ContentFormat, IdeaAnalysis } from "@contentos/schemas";
import { AppError, isAppError, type Logger } from "@contentos/shared";
import { z } from "zod";

export interface PipelineDeps {
  db: ServiceClient;
  controller: UsageController;
  logger: Logger;
}

export interface RunOptions {
  /** True on the last attempt the orchestrator will make; failures become final. */
  finalAttempt: boolean;
}

/** Errors that will not succeed on retry. The orchestrator must not retry these. */
export class NonRetryableJobError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "NonRetryableJobError";
  }
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function promptTemplateId(db: ServiceClient, userId: string, t: PromptTemplate, purpose: string): Promise<string> {
  return svc.ensurePromptTemplate(db, userId, { name: t.name, version: t.version, purpose, body: t.text, hash: templateHash(t) });
}

function classify(err: unknown): { code: string; message: string; retryable: boolean } {
  if (err instanceof ProviderError) return { code: err.kind, message: err.message, retryable: err.retryable };
  if (isAppError(err)) return { code: err.code, message: err.message, retryable: err.status >= 500 && err.code !== "INTERNAL" };
  return { code: "INTERNAL", message: "Unexpected error while running the job.", retryable: true };
}

/** Run one step with failure bookkeeping shared by every pipeline. */
async function runStep<T extends Record<string, unknown>>(
  deps: PipelineDeps,
  job: svc.JobRecord,
  opts: RunOptions,
  step: { name: string; position: number; inputHash: string },
  work: (stepId: string) => Promise<{ output: T; cost: number }>,
): Promise<T> {
  const { step: row, reusable } = await svc.beginStep(deps.db, job, step);
  if (reusable) {
    deps.logger.info("step_reused", { jobId: job.id, step: step.name });
    return row.output as T;
  }
  try {
    const { output, cost } = await work(row.id);
    await svc.finishStep(deps.db, job, row.id, { status: "completed", output, cost });
    return output;
  } catch (err) {
    const c = classify(err);
    const final = !c.retryable || opts.finalAttempt;
    await svc.finishStep(deps.db, job, row.id, { status: "failed", error: { code: c.code, message: c.message } });
    await svc.updateJob(deps.db, job, {
      status: final ? "failed" : "running",
      error: { code: c.code, message: c.message },
      ...(final ? { completed_at: new Date().toISOString() } : {}),
    });
    deps.logger.warn("step_failed", { jobId: job.id, step: step.name, code: c.code, final });
    if (!c.retryable) throw new NonRetryableJobError(c.code, c.message);
    throw err;
  }
}

async function complete(deps: PipelineDeps, job: svc.JobRecord): Promise<void> {
  const actual = await svc.sumSpend(deps.db, { userId: job.user_id, jobId: job.id });
  await svc.updateJob(deps.db, job, {
    status: "completed",
    progress: 100,
    current_step: "done",
    error: null,
    actual_cost: actual,
    completed_at: new Date().toISOString(),
  });
}

async function loadAndStart(deps: PipelineDeps, jobId: string, type: string): Promise<svc.JobRecord | null> {
  const job = await svc.loadJob(deps.db, jobId);
  if (job.job_type !== type) throw new NonRetryableJobError("INTERNAL", `Job ${jobId} is ${job.job_type}, not ${type}.`);
  if (job.status === "completed" || job.status === "cancelled") return null;
  await svc.updateJob(deps.db, job, { status: "running", started_at: new Date().toISOString(), progress: 5, current_step: "loading" });
  return job;
}

// ---------------------------------------------------------------------------
// analyze_idea
// ---------------------------------------------------------------------------

const AnalyzeInput = z.object({ idea_id: z.uuid() });

export async function runAnalyzeIdea(deps: PipelineDeps, jobId: string, opts: RunOptions): Promise<void> {
  const job = await loadAndStart(deps, jobId, "analyze_idea");
  if (!job) return;
  const input = AnalyzeInput.safeParse(job.input);
  if (!input.success) throw new NonRetryableJobError("VALIDATION_FAILED", "Job input is invalid.");

  const userId = job.user_id;
  const idea = await svc.loadIdea(deps.db, userId, input.data.idea_id);
  const brand = await svc.loadBrand(deps.db, userId, idea.brand_id);
  const settings = await svc.loadSettings(deps.db, userId);
  await svc.updateJob(deps.db, job, { progress: 20, current_step: "retrieving_knowledge" });
  const examples = await svc.loadVoiceExamples(deps.db, userId, brand.id);
  const related = await svc.searchKnowledge(deps.db, userId, brand.id, `${idea.title} ${idea.raw_input}`);
  const templateId = await promptTemplateId(deps.db, userId, IDEA_ANALYST, "Analyse a raw idea before writing");

  const inputHash = stableHash({
    idea: [idea.title, idea.raw_input],
    brand: brand.updated_at,
    examples: examples.map((e) => e.id),
    related: related.map((k) => k.id),
    template: templateHash(IDEA_ANALYST),
  });

  await svc.updateJob(deps.db, job, { progress: 40, current_step: "analyzing" });
  await runStep(deps, job, opts, { name: "analyze", position: 1, inputHash }, async (stepId) => {
    const request = buildIdeaAnalysisRequest({ brand, examples, related }, idea);
    await svc.updateJob(deps.db, job, { estimated_cost: deps.controller.estimate(request, deps.controller.route(request.task)) });
    const result = await deps.controller.generate(
      request,
      { userId, jobId: job.id, stepId, promptTemplateId: templateId },
      { dailyUsd: settings.budget_daily_usd, monthlyUsd: settings.budget_monthly_usd, jobUsd: job.budget_limit_usd },
    );
    await svc.saveIdeaAnalysis(deps.db, userId, idea.id, result.output, inputHash);
    return { output: { idea_id: idea.id, model: result.model, cost_usd: result.costUsd }, cost: result.costUsd };
  });
  await complete(deps, job);
}

// ---------------------------------------------------------------------------
// generate_brief
// ---------------------------------------------------------------------------

const BriefInput = z.object({ project_id: z.uuid(), guidance: z.string().max(2000).optional(), nonce: z.string().optional() });

export async function runGenerateBrief(deps: PipelineDeps, jobId: string, opts: RunOptions): Promise<void> {
  const job = await loadAndStart(deps, jobId, "generate_brief");
  if (!job) return;
  const input = BriefInput.safeParse(job.input);
  if (!input.success) throw new NonRetryableJobError("VALIDATION_FAILED", "Job input is invalid.");

  const userId = job.user_id;
  const project = await svc.loadProject(deps.db, userId, input.data.project_id);
  if (!project.idea_id) throw new NonRetryableJobError("VALIDATION_FAILED", "Project has no source idea.");
  const idea = await svc.loadIdea(deps.db, userId, project.idea_id);
  const brand = await svc.loadBrand(deps.db, userId, project.brand_id);
  const settings = await svc.loadSettings(deps.db, userId);
  const formats = z.array(ContentFormat).min(1).catch(["linkedin", "x_thread"]).parse(project.settings.formats);
  const parsedAnalysis = IdeaAnalysis.safeParse(idea.analysis);
  const analysis = parsedAnalysis.success ? parsedAnalysis.data : null;

  await svc.updateJob(deps.db, job, { progress: 20, current_step: "retrieving_knowledge" });
  const examples = await svc.loadVoiceExamples(deps.db, userId, brand.id);
  const related = await svc.searchKnowledge(deps.db, userId, brand.id, `${idea.title} ${idea.raw_input}`);
  const templateId = await promptTemplateId(deps.db, userId, STRATEGIST, "Turn an idea into a master brief");

  const inputHash = stableHash({
    idea: [idea.title, idea.raw_input],
    analysis,
    brand: brand.updated_at,
    examples: examples.map((e) => e.id),
    related: related.map((k) => k.id),
    formats,
    guidance: input.data.guidance ?? null,
    template: templateHash(STRATEGIST),
  });

  await svc.updateJob(deps.db, job, { progress: 40, current_step: "writing_brief" });
  await runStep(deps, job, opts, { name: "brief", position: 1, inputHash }, async (stepId) => {
    const request = buildBriefRequest({ brand, examples, related }, { idea, analysis, formats, guidance: input.data.guidance });
    await svc.updateJob(deps.db, job, { estimated_cost: deps.controller.estimate(request, deps.controller.route(request.task)) });
    const result = await deps.controller.generate(
      request,
      { userId, projectId: project.id, jobId: job.id, stepId, promptTemplateId: templateId },
      {
        dailyUsd: settings.budget_daily_usd,
        monthlyUsd: settings.budget_monthly_usd,
        projectUsd: settings.budget_text_project_usd,
        jobUsd: job.budget_limit_usd,
      },
    );
    const brief = finaliseBrief(result.output, formats);
    const saved = await svc.insertBrief(deps.db, userId, {
      projectId: project.id,
      brief,
      model: result.model,
      promptTemplateId: templateId,
      inputHash,
      jobId: job.id,
    });
    return { output: { brief_id: saved.id, version: saved.version, model: result.model, cost_usd: result.costUsd }, cost: result.costUsd };
  });
  await complete(deps, job);
}

export { AppError };
