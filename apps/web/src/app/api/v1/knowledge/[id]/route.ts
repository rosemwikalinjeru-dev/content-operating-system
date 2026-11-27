import { deleteKnowledge, updateKnowledge } from "@contentos/database";
import { KnowledgeUpdate, Uuid } from "@contentos/schemas";
import { api, json, parseJson, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

type Params = { id: string };

export const PATCH = api<Params>(async ({ req, params }) => {
  const { db } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "knowledge entry");
  return json(await updateKnowledge(db, id, await parseJson(req, KnowledgeUpdate)));
});

export const DELETE = api<Params>(async ({ params }) => {
  const { db } = await requireApiSession();
  await deleteKnowledge(db, parseParam(params.id, Uuid, "knowledge entry"));
  return new Response(null, { status: 204 });
});
