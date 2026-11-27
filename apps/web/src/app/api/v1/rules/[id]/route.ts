import { setLearnedRuleStatus } from "@contentos/database";
import { LearnedRuleUpdate, Uuid } from "@contentos/schemas";
import { api, json, parseJson, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

type Params = { id: string };

export const PATCH = api<Params>(async ({ req, params }) => {
  const { db } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "rule");
  const { status } = await parseJson(req, LearnedRuleUpdate);
  return json(await setLearnedRuleStatus(db, id, status));
});
