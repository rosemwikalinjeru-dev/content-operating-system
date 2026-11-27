import { approvedBriefId, getProject } from "@contentos/database";
import { ContentFormat, Uuid, WriteRequest } from "@contentos/schemas";
import { AppError } from "@contentos/shared";
import { api, json, parseJson, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";
import { enqueueJob, idempotencyHeader } from "@/lib/jobs";

type Params = { id: string };

// Inline jobs run in this function after the response (Plan B), so allow the full duration.
export const maxDuration = 300;

/**
 * Write every format (or the ones given) from the project's approved brief. The key covers the
 * brief version and formats, so clicking twice does not write twice; formats whose inputs are
 * unchanged are reused inside the job. force=true writes fresh drafts.
 */
export const POST = api<Params>(async ({ req, params }) => {
  const { db, userId } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "project");
  const input = await parseJson(req, WriteRequest);
  const project = await getProject(db, id);
  const brief = await approvedBriefId(db, id);
  if (!brief) throw new AppError("CONFLICT", "Approve a brief before writing.");
  const projectFormats = ContentFormat.array().safeParse(project.settings?.formats);
  const formats = input.formats ?? (projectFormats.success && projectFormats.data.length ? projectFormats.data : ["linkedin", "x_thread", "carousel", "short_video"]);
  const key =
    idempotencyHeader(req) ?? `write:${brief.id}:${[...formats].sort().join(",")}${input.force ? `:force:${Date.now()}` : ""}`;
  const job = await enqueueJob(db, userId, {
    jobType: "write_content",
    idempotencyKey: key,
    projectId: id,
    payload: { project_id: id, brief_id: brief.id, formats, force: input.force },
  });
  return json({ job_id: job.jobId, status: job.status, created: job.created }, job.created ? 202 : 200);
});
