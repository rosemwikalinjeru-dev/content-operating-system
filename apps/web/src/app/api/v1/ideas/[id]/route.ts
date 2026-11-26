import { deleteIdea, getIdea, updateIdea } from "@contentos/database";
import { IdeaUpdate, Uuid } from "@contentos/schemas";
import { api, json, parseJson, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

type Params = { id: string };

export const GET = api<Params>(async ({ params }) => {
  const { db } = await requireApiSession();
  return json(await getIdea(db, parseParam(params.id, Uuid, "idea")));
});

export const PATCH = api<Params>(async ({ req, params }) => {
  const { db } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "idea");
  return json(await updateIdea(db, id, await parseJson(req, IdeaUpdate)));
});

export const DELETE = api<Params>(async ({ params }) => {
  const { db } = await requireApiSession();
  await deleteIdea(db, parseParam(params.id, Uuid, "idea"));
  return new Response(null, { status: 204 });
});
