import { getIdeaWithAnalysis } from "@contentos/database";
import { Uuid } from "@contentos/schemas";
import { api, json, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";
import { enqueueJob, idempotencyHeader, shortHash } from "@/lib/jobs";

type Params = { id: string };

// Inline jobs run in this function after the response (Plan B), so allow the full duration.
export const maxDuration = 300;

/**
 * Start (or return) an analysis job. Without ?force=1, the idempotency key is derived from the
 * idea text, so re-clicking Analyse on an unchanged idea returns the same job and costs nothing.
 */
export const POST = api<Params>(async ({ req, params }) => {
  const { db, userId } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "idea");
  const idea = await getIdeaWithAnalysis(db, id);
  const force = req.nextUrl.searchParams.get("force") === "1";
  const key =
    idempotencyHeader(req) ??
    `analyze:${id}:${shortHash([idea.title, idea.raw_input])}${force ? `:force:${Date.now()}` : ""}`;

  const job = await enqueueJob(db, userId, { jobType: "analyze_idea", idempotencyKey: key, payload: { idea_id: id } });
  return json({ job_id: job.jobId, status: job.status, created: job.created }, job.created ? 202 : 200);
});
