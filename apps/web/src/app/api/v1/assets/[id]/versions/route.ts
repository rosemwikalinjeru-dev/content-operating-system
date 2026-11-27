import { addHumanVersion, getAssetVersion } from "@contentos/database";
import { applyManualEdit, ManualEditRequest, Uuid } from "@contentos/schemas";
import { AppError } from "@contentos/shared";
import { api, json, parseJson, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";
import { enqueueJob } from "@/lib/jobs";

export const maxDuration = 300;

type Params = { id: string };

/** Save the owner's hand edits as a new human version (the base version is never changed), then learn from them. */
export const POST = api<Params>(async ({ req, params }) => {
  const { db, userId } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "content");
  const input = await parseJson(req, ManualEditRequest);
  const base = await getAssetVersion(db, id, input.base_version);
  const keys = new Set(base.body.sections.map((s) => s.key));
  const unknown = input.sections.find((s) => !keys.has(s.key));
  if (unknown) throw new AppError("VALIDATION_FAILED", `Section ${unknown.key} is not in version ${input.base_version}.`);
  const { body, changed } = applyManualEdit(base.body, input.sections);
  if (changed === 0) throw new AppError("VALIDATION_FAILED", "Nothing changed.");
  const saved = await addHumanVersion(db, {
    assetId: id,
    body,
    parentVersion: input.base_version,
    note: input.note ?? `Edited by hand (${changed} change${changed === 1 ? "" : "s"})`,
  });
  // Learn from the edit: proposed rules wait for the owner's approval before they are used.
  await enqueueJob(db, userId, { jobType: "propose_rules", idempotencyKey: `rules:edit:${saved.id}`, payload: {} });
  return json(saved, 201);
});
