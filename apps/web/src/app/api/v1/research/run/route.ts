import { ResearchRunRequest } from "@contentos/schemas";
import { api, json, parseJson } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";
import { enqueueJob, idempotencyHeader, shortHash } from "@/lib/jobs";

// Inline jobs run in this function after the response (Plan B), so allow the full duration.
export const maxDuration = 300;

/**
 * Start a research sweep. The idempotency key covers the settings and the hour, so a double
 * click does not spend ScrapeCreators credits twice.
 */
export const POST = api(async ({ req }) => {
  const { db, userId } = await requireApiSession();
  const input = await parseJson(req, ResearchRunRequest);
  const hour = new Date().toISOString().slice(0, 13);
  const key = idempotencyHeader(req) ?? `research:${hour}:${shortHash(input)}`;
  const job = await enqueueJob(db, userId, { jobType: "research_sweep", idempotencyKey: key, payload: input });
  return json({ job_id: job.jobId, status: job.status, created: job.created }, job.created ? 202 : 200);
});
