import "server-only";
import { createJob, failJobIfActive, failJobToStart, setJobOrchestratorRun, type UserClient } from "@contentos/database";
import type { analyzeIdeaTask, generateBriefTask } from "@contentos/jobs";
import type { JobType } from "@contentos/schemas";
import { AppError, logger } from "@contentos/shared";
import { after } from "next/server";
import { createHash } from "node:crypto";

const TASK_IDS = { analyze_idea: "analyze-idea", generate_brief: "generate-brief" } as const satisfies Record<JobType, string>;

/**
 * Where background jobs run.
 *  - "inline" (default, Plan B): in this Vercel function after the response is sent (`after()`).
 *  - "trigger": Trigger.dev, once deployments are enabled for the organisation.
 */
export function jobRunner(): "inline" | "trigger" {
  return process.env.JOB_RUNNER === "trigger" ? "trigger" : "inline";
}

export function shortHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

/** Client-supplied Idempotency-Key header, if valid. */
export function idempotencyHeader(req: Request): string | null {
  const key = req.headers.get("idempotency-key");
  return key && /^[A-Za-z0-9_:.-]{8,128}$/.test(key) ? key : null;
}

export interface EnqueueResult {
  jobId: string;
  status: string;
  created: boolean;
}

/**
 * Create the job row (idempotent) and start it. A duplicate request returns the existing job
 * without starting it again. A previous failure does not block a retry.
 */
export async function enqueueJob(
  db: UserClient,
  userId: string,
  input: { jobType: JobType; idempotencyKey: string; projectId?: string | null; payload: Record<string, unknown> },
): Promise<EnqueueResult> {
  let job = await createJob(db, userId, {
    jobType: input.jobType,
    idempotencyKey: input.idempotencyKey,
    projectId: input.projectId,
    input: input.payload,
  });
  if (!job.created && (job.status === "failed" || job.status === "cancelled")) {
    job = await createJob(db, userId, {
      jobType: input.jobType,
      idempotencyKey: `${input.idempotencyKey}:retry:${Date.now()}`,
      projectId: input.projectId,
      input: input.payload,
    });
  }
  if (!job.created) return { jobId: job.id, status: job.status, created: false };

  if (jobRunner() === "trigger") await startOnTrigger(db, input.jobType, job.id);
  else startInline(db, input.jobType, job.id);
  return { jobId: job.id, status: "queued", created: true };
}

/** Run after the response is sent. Any failure the pipeline did not record still ends the job. */
function startInline(db: UserClient, jobType: JobType, jobId: string): void {
  after(async () => {
    try {
      const { runJobInline } = await import("@contentos/jobs/runner");
      await runJobInline(jobType, jobId);
    } catch (err) {
      const configError = err instanceof Error && err.message.startsWith("Worker environment");
      logger.error("inline_job_failed", { jobId, jobType, error: err instanceof Error ? err.message : String(err) });
      await failJobIfActive(db, jobId, {
        code: configError ? "SERVICE_UNAVAILABLE" : "INTERNAL",
        message: configError
          ? "Background jobs are not configured. Check SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY in Vercel."
          : "The job stopped unexpectedly. Try again.",
      }).catch((e) => logger.error("inline_job_fail_mark_failed", { jobId, error: String(e) }));
    }
  });
}

async function startOnTrigger(db: UserClient, jobType: JobType, jobId: string): Promise<void> {
  try {
    const { tasks } = await import("@trigger.dev/sdk");
    const handle =
      jobType === "analyze_idea"
        ? await tasks.trigger<typeof analyzeIdeaTask>(TASK_IDS.analyze_idea, { jobId }, { idempotencyKey: jobId })
        : await tasks.trigger<typeof generateBriefTask>(TASK_IDS.generate_brief, { jobId }, { idempotencyKey: jobId });
    await setJobOrchestratorRun(db, jobId, handle.id);
  } catch (err) {
    logger.error("job_trigger_failed", { jobId, error: err instanceof Error ? err.message : String(err) });
    await failJobToStart(db, jobId, "Background jobs are not reachable. Check TRIGGER_SECRET_KEY in Vercel.");
    throw new AppError("SERVICE_UNAVAILABLE", "Background jobs are not reachable right now. Try again shortly.");
  }
}
