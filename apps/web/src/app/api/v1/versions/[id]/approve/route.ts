import { approveContentVersion, getVersionById } from "@contentos/database";
import { Uuid } from "@contentos/schemas";
import { AppError } from "@contentos/shared";
import { api, json, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

type Params = { id: string };

/** Approve a version. Blocked while owner-only [placeholders] remain unfilled. */
export const PATCH = api<Params>(async ({ params }) => {
  const { db } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "version");
  const v = await getVersionById(db, id);
  if (v.body.placeholders?.length) {
    throw new AppError("CONFLICT", `Fill these before approving: ${v.body.placeholders.join(", ")}`, { placeholders: v.body.placeholders });
  }
  return json(await approveContentVersion(db, id));
});
