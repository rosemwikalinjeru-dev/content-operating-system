import { getProject } from "@contentos/database";
import { BriefRequest, Uuid } from "@contentos/schemas";
import { api, json, parseJson, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";
import { enqueueJob, idempotencyHeader, shortHash } from "@/lib/jobs";

type Params = { id: string };

// Inline jobs run in this function after the response (Plan B), so allow the full duration.
export const maxDuration = 300;

/**
 * Generate a new brief version. Each deliberate click sends a fresh Idempotency-Key, so
 * double-submits collapse into one job while intentional regenerations create a new version.
 */
export const POST = api<Params>(async ({ req, params }) => {
  const { db, userId } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "project");
  const project = await getProject(db, id);
  const input = await parseJson(req, BriefRequest);
  const minute = Math.floor(Date.now() / 60_000);
  const key = idempotencyHeader(req) ?? `brief:${id}:${shortHash(input.guidance ?? "")}:${minute}`;

  const job = await enqueueJob(db, userId, {
    jobType: "generate_brief",
    idempotencyKey: key,
    projectId: project.id,
    payload: { project_id: project.id, ...(input.guidance ? { guidance: input.guidance } : {}) },
  });
  return json({ job_id: job.jobId, status: job.status, created: job.created }, job.created ? 202 : 200);
});
