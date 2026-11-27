import { AbortTaskRunError, task } from "@trigger.dev/sdk";
import { NonRetryableJobError, runAnalyzeIdea, runGenerateBrief } from "../pipeline";
import { runResearchSweep } from "../research";
import { pipelineDeps, researchDeps } from "../runtime";

export interface JobPayload {
  jobId: string;
}

const MAX_ATTEMPTS = 3;

const retry = { maxAttempts: MAX_ATTEMPTS, minTimeoutInMs: 2_000, maxTimeoutInMs: 30_000, factor: 2, randomize: true };

/** Map non-retryable failures to Trigger.dev's abort so it does not retry them. */
async function guard(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof NonRetryableJobError) throw new AbortTaskRunError(`${err.code}: ${err.message}`);
    throw err;
  }
}

export const analyzeIdeaTask = task({
  id: "analyze-idea",
  maxDuration: 300,
  retry,
  run: async (payload: JobPayload, { ctx }) => {
    await guard(() => runAnalyzeIdea(pipelineDeps(), payload.jobId, { finalAttempt: ctx.attempt.number >= MAX_ATTEMPTS }));
  },
});

export const generateBriefTask = task({
  id: "generate-brief",
  maxDuration: 600,
  retry,
  run: async (payload: JobPayload, { ctx }) => {
    await guard(() => runGenerateBrief(pipelineDeps(), payload.jobId, { finalAttempt: ctx.attempt.number >= MAX_ATTEMPTS }));
  },
});

export const researchSweepTask = task({
  id: "research-sweep",
  maxDuration: 900,
  retry,
  run: async (payload: JobPayload, { ctx }) => {
    await guard(() =>
      runResearchSweep({ ...pipelineDeps(), ...researchDeps() }, payload.jobId, { finalAttempt: ctx.attempt.number >= MAX_ATTEMPTS }),
    );
  },
});
