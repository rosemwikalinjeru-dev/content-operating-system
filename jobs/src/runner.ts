/**
 * Inline job runner (Plan B): runs a pipeline in the current server process, with the retry
 * behaviour Trigger.dev would otherwise provide. Used by the web app via Next.js `after()`.
 *
 * Server-only. Imports the service-role database client through pipelineDeps().
 */
import type { JobType } from "@contentos/schemas";
import { NonRetryableJobError, runAnalyzeIdea, runGenerateBrief, type PipelineDeps, type RunOptions } from "./pipeline";
import { runResearchSweep, type ResearchDeps } from "./research";
import { pipelineDeps, researchDeps } from "./runtime";

const PIPELINES: Record<JobType, (deps: PipelineDeps, jobId: string, opts: RunOptions) => Promise<void>> = {
  analyze_idea: runAnalyzeIdea,
  generate_brief: runGenerateBrief,
  research_sweep: (deps, jobId, opts) => runResearchSweep(withResearch(deps), jobId, opts),
};

function withResearch(deps: PipelineDeps): ResearchDeps {
  return "scrapeCreators" in deps ? (deps as ResearchDeps) : { ...deps, scrapeCreators: researchDeps().scrapeCreators };
}

export interface InlineOptions {
  maxAttempts?: number;
  /** Delay before attempt n (1-based, n >= 2). */
  backoffMs?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
  deps?: PipelineDeps;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run a job to completion. Retryable failures (rate limits, provider outages, network) are
 * retried with backoff; the last attempt marks the job failed. Non-retryable failures (budget,
 * refusal, invalid input) stop immediately. Throws the final error so the caller can make sure
 * the job is not left active.
 */
export async function runJobInline(jobType: JobType, jobId: string, opts: InlineOptions = {}): Promise<void> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const backoff = opts.backoffMs ?? ((n) => 2_000 * 3 ** (n - 2));
  const sleep = opts.sleep ?? defaultSleep;
  const deps = opts.deps ?? pipelineDeps();
  const pipeline = PIPELINES[jobType];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pipeline(deps, jobId, { finalAttempt: attempt === maxAttempts });
      return;
    } catch (err) {
      const final = err instanceof NonRetryableJobError || attempt === maxAttempts;
      deps.logger.warn("inline_job_attempt_failed", {
        jobId,
        jobType,
        attempt,
        final,
        error: err instanceof Error ? err.message : String(err),
      });
      if (final) throw err;
      await sleep(backoff(attempt + 1));
    }
  }
}
