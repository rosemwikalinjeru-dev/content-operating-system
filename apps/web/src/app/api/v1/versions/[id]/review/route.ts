import { getVersionById } from "@contentos/database";
import { Uuid } from "@contentos/schemas";
import { api, json, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";
import { enqueueJob, idempotencyHeader } from "@/lib/jobs";

type Params = { id: string };

export const maxDuration = 300;

/** Review a version on request (hand edits are only reviewed when the owner asks). */
export const POST = api<Params>(async ({ req, params }) => {
  const { db, userId } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "version");
  await getVersionById(db, id);
  const job = await enqueueJob(db, userId, {
    jobType: "review_version",
    idempotencyKey: idempotencyHeader(req) ?? `review:${id}`,
    payload: { version_id: id },
  });
  return json({ job_id: job.jobId, status: job.status, created: job.created }, job.created ? 202 : 200);
});
