import { removeCompetitor, updateCompetitor } from "@contentos/database";
import { CompetitorUpdate, Uuid } from "@contentos/schemas";
import { api, json, parseJson, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

type Params = { id: string };

export const PATCH = api<Params>(async ({ req, params }) => {
  const { db } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "competitor");
  return json(await updateCompetitor(db, id, await parseJson(req, CompetitorUpdate)));
});

export const DELETE = api<Params>(async ({ params }) => {
  const { db } = await requireApiSession();
  await removeCompetitor(db, parseParam(params.id, Uuid, "competitor"));
  return new Response(null, { status: 204 });
});
