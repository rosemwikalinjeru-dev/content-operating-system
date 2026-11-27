import { deleteResearchQuery, updateResearchQuery } from "@contentos/database";
import { ResearchQueryUpdate, Uuid } from "@contentos/schemas";
import { api, json, parseJson, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

type Params = { id: string };

export const PATCH = api<Params>(async ({ req, params }) => {
  const { db } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "keyword");
  return json(await updateResearchQuery(db, id, await parseJson(req, ResearchQueryUpdate)));
});

export const DELETE = api<Params>(async ({ params }) => {
  const { db } = await requireApiSession();
  await deleteResearchQuery(db, parseParam(params.id, Uuid, "keyword"));
  return new Response(null, { status: 204 });
});
