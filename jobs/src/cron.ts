/**
 * Weekly research schedule (Plan B: Vercel Cron → /api/v1/cron/research).
 * Server-only: uses the service-role client because cron requests have no user session.
 */
import * as svc from "@contentos/database/service";
import { ResearchRunRequest } from "@contentos/schemas";
import type { PipelineDeps } from "./pipeline";
import { pipelineDeps } from "./runtime";

export interface DueRun {
  scheduleId: string;
  userId: string;
  jobId: string;
  created: boolean;
}

/**
 * Create one research job per due, owner-approved schedule and move the schedule on a week.
 * Idempotent per schedule and day: a repeated cron call returns the same job.
 */
export async function createDueResearchJobs(deps: Pick<PipelineDeps, "db"> = pipelineDeps(), now = new Date()): Promise<DueRun[]> {
  const due = await svc.dueResearchSchedules(deps.db, now);
  const runs: DueRun[] = [];
  for (const s of due) {
    const settings = ResearchRunRequest.safeParse(s.settings ?? {});
    const input = settings.success ? settings.data : ResearchRunRequest.parse({});
    const job = await svc.createJobAsService(deps.db, s.user_id, {
      jobType: "research_sweep",
      idempotencyKey: `research:schedule:${s.id}:${now.toISOString().slice(0, 10)}`,
      input,
    });
    await svc.advanceSchedule(deps.db, s.id);
    runs.push({ scheduleId: s.id, userId: s.user_id, jobId: job.id, created: job.created });
  }
  return runs;
}
