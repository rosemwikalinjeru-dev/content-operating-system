import { listProjectAssets } from "@contentos/database";
import { Uuid } from "@contentos/schemas";
import { api, json, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

type Params = { id: string };

export const GET = api<Params>(async ({ params }) => {
  const { db } = await requireApiSession();
  return json({ data: await listProjectAssets(db, parseParam(params.id, Uuid, "project")) });
});
