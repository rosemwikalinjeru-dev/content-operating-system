import { addAiVersionFromSuggestion, countUnusedRejections, decideSuggestion, getLatestVersion, getSuggestion, getVersionById } from "@contentos/database";
import { refreshBody, SuggestionDecision, Uuid } from "@contentos/schemas";
import { AppError } from "@contentos/shared";
import { api, json, parseJson, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";
import { enqueueJob } from "@/lib/jobs";

type Params = { id: string };

export const maxDuration = 300;

/**
 * Accept: apply the suggested rewrite to its section as a new version (no model call), then
 * review that version. Reject: record it; two or more unused rejections start rule learning.
 */
export const PATCH = api<Params>(async ({ req, params }) => {
  const { db, userId } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "suggestion");
  const { action } = await parseJson(req, SuggestionDecision);
  const s = await getSuggestion(db, id);
  if (s.status !== "pending") throw new AppError("CONFLICT", "This suggestion was already decided.");

  if (action === "reject") {
    await decideSuggestion(db, id, "rejected", null);
    if ((await countUnusedRejections(db)) >= 2) {
      await enqueueJob(db, userId, { jobType: "propose_rules", idempotencyKey: `rules:rejections:${id}`, payload: {} });
    }
    return json({ status: "rejected" });
  }

  // Apply on top of the newest version, so accepting several suggestions keeps every change —
  // but only if the target section has not changed since the review.
  const base = await getVersionById(db, s.version_id);
  const latest = await getLatestVersion(db, s.asset_id);
  const reviewed = base.body.sections.find((sec) => sec.key === s.section_key);
  const current = latest.body.sections.find((sec) => sec.key === s.section_key);
  if (!reviewed || !current || current.text !== reviewed.text || current.headline !== reviewed.headline) {
    throw new AppError("CONFLICT", `Section ${s.section_key} has changed since this review. Review the latest version again.`);
  }
  const sections = latest.body.sections.map((sec) =>
    sec.key === s.section_key
      ? {
          ...sec,
          text: s.rewrite.text,
          headline: sec.headline !== null || s.rewrite.headline ? s.rewrite.headline : null,
          on_screen: sec.on_screen !== null || s.rewrite.on_screen ? s.rewrite.on_screen : null,
          broll: sec.broll !== null || s.rewrite.broll ? s.rewrite.broll : null,
        }
      : sec,
  );
  const created = await addAiVersionFromSuggestion(db, {
    assetId: s.asset_id,
    body: refreshBody(latest.body, sections),
    parentVersion: latest.version,
    section: s.section_key,
    note: `${s.section_key}: accepted suggestion — ${s.issue}`,
    model: s.reviewer_model ?? "editorial-reviewer",
  });
  await decideSuggestion(db, id, "accepted", created.version);
  const job = await enqueueJob(db, userId, {
    jobType: "review_version",
    idempotencyKey: `review:${created.id}`,
    payload: { version_id: created.id },
  });
  return json({ status: "accepted", version: created.version, review_job_id: job.jobId });
});
