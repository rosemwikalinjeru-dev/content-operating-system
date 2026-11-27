import { approveBrief } from "@contentos/database";
import { Uuid } from "@contentos/schemas";
import { api, json, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

type Params = { id: string };

/** Owner approval. The approved brief becomes immutable; any earlier approval is superseded. */
export const PATCH = api<Params>(async ({ params }) => {
  const { db } = await requireApiSession();
  return json(await approveBrief(db, parseParam(params.id, Uuid, "brief")));
});
