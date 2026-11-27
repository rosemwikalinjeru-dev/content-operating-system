import { rejectBrief } from "@contentos/database";
import { Uuid } from "@contentos/schemas";
import { api, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

type Params = { id: string };

export const PATCH = api<Params>(async ({ params }) => {
  const { db } = await requireApiSession();
  await rejectBrief(db, parseParam(params.id, Uuid, "brief"));
  return new Response(null, { status: 204 });
});
