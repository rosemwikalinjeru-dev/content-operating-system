import { designContext, getDesign } from "@contentos/database";
import { SlideReviseRequest, Uuid } from "@contentos/schemas";
import { AppError } from "@contentos/shared";
import { api, json, parseJson, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";
import { enqueueJob, idempotencyHeader, shortHash } from "@/lib/jobs";

type Params = { id: string };

export const maxDuration = 300;

export const POST = api<Params>(async ({ req, params }) => {
  const { db, userId } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "design");
  const input = await parseJson(req, SlideReviseRequest);
  const design = await getDesign(db, id);
  if (!design.slides.some((s) => s.id === input.slide)) throw new AppError("VALIDATION_FAILED", `Slide ${input.slide} is not in this design.`);
  const ctx = await designContext(db, design.asset_id);
  const job = await enqueueJob(db, userId, {
    jobType: "revise_slide",
    idempotencyKey: idempotencyHeader(req) ?? `revise-slide:${id}:${input.slide}:${shortHash(input.instruction)}`,
    projectId: ctx.projectId,
    payload: { design_id: id, slide: input.slide, instruction: input.instruction },
  });
  return json({ job_id: job.jobId, status: job.status, created: job.created }, job.created ? 202 : 200);
});
