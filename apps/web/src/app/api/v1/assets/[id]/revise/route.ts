import { getAsset, getAssetVersion } from "@contentos/database";
import { ReviseRequest, Uuid } from "@contentos/schemas";
import { AppError } from "@contentos/shared";
import { api, json, parseJson, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";
import { enqueueJob, idempotencyHeader, shortHash } from "@/lib/jobs";

type Params = { id: string };

export const maxDuration = 300;

/** Rewrite one section of a version with the owner's instruction; creates a new version. */
export const POST = api<Params>(async ({ req, params }) => {
  const { db, userId } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "content");
  const input = await parseJson(req, ReviseRequest);
  const asset = await getAsset(db, id);
  const base = await getAssetVersion(db, id, input.version);
  if (!base.body.sections.some((s) => s.key === input.section)) {
    throw new AppError("VALIDATION_FAILED", `Section ${input.section} is not in version ${input.version}.`);
  }
  const key = idempotencyHeader(req) ?? `revise:${id}:${input.version}:${input.section}:${shortHash(input.instruction)}`;
  const job = await enqueueJob(db, userId, {
    jobType: "revise_section",
    idempotencyKey: key,
    projectId: asset.project_id,
    payload: { asset_id: id, version: input.version, section: input.section, instruction: input.instruction },
  });
  return json({ job_id: job.jobId, status: job.status, created: job.created }, job.created ? 202 : 200);
});
