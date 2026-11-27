import "server-only";
import { createJob, failJobToStart, setJobOrchestratorRun, type UserClient } from "@contentos/database";
import type { analyzeIdeaTask, generateBriefTask } from "@contentos/jobs";
import type { JobType } from "@contentos/schemas";
import { AppError, logger } from "@contentos/shared";
import { tasks } from "@trigger.dev/sdk";
import { createHash } from "node:crypto";

const TASK_IDS = { analyze_idea: "analyze-idea", generate_brief: "generate-brief" } as const satisfies Record<JobType, string>;

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
 * Create the job row (idempotent) and hand it to Trigger.dev. A duplicate request returns the
 * existing job without triggering it again. A previous failure does not block a retry.
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

  try {
    const handle =
      input.jobType === "analyze_idea"
        ? await tasks.trigger<typeof analyzeIdeaTask>(TASK_IDS.analyze_idea, { jobId: job.id }, { idempotencyKey: job.id })
        : await tasks.trigger<typeof generateBriefTask>(TASK_IDS.generate_brief, { jobId: job.id }, { idempotencyKey: job.id });
    await setJobOrchestratorRun(db, job.id, handle.id);
  } catch (err) {
    logger.error("job_trigger_failed", { jobId: job.id, error: err instanceof Error ? err.message : String(err) });
    await failJobToStart(db, job.id, "Background jobs are not reachable. Check TRIGGER_SECRET_KEY in Vercel.");
    throw new AppError("SERVICE_UNAVAILABLE", "Background jobs are not reachable right now. Try again shortly.");
  }
  return { jobId: job.id, status: "queued", created: true };
}
