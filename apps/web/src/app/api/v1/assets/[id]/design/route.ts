import { designContext } from "@contentos/database";
import { DesignRequest, Uuid } from "@contentos/schemas";
import { api, json, parseJson, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";
import { enqueueJob, idempotencyHeader } from "@/lib/jobs";

type Params = { id: string };

export const maxDuration = 300;

/** Design the carousel from its narrative (approved version by default). */
export const POST = api<Params>(async ({ req, params }) => {
  const { db, userId } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "content");
  const input = await parseJson(req, DesignRequest);
  const ctx = await designContext(db, id);
  const key = idempotencyHeader(req) ?? `design:${id}:${input.version ?? "auto"}:${input.template ?? "auto"}:${Date.now()}`;
  const job = await enqueueJob(db, userId, {
    jobType: "design_carousel",
    idempotencyKey: key,
    projectId: ctx.projectId,
    payload: { asset_id: id, ...(input.version ? { version: input.version } : {}), ...(input.template ? { template: input.template } : {}) },
  });
  return json({ job_id: job.jobId, status: job.status, created: job.created }, job.created ? 202 : 200);
});
