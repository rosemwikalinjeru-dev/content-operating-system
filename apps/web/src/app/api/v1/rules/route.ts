import { createLearnedRule, getDefaultBrand, listLearnedRules } from "@contentos/database";
import { LearnedRuleCreate } from "@contentos/schemas";
import { api, json, parseJson } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

export const GET = api(async () => {
  const { db } = await requireApiSession();
  const brand = await getDefaultBrand(db);
  return json({ data: await listLearnedRules(db, brand.id) });
});

/** A rule the owner writes herself is approved immediately. */
export const POST = api(async ({ req }) => {
  const { db, userId } = await requireApiSession();
  const { rule } = await parseJson(req, LearnedRuleCreate);
  const brand = await getDefaultBrand(db);
  return json(await createLearnedRule(db, userId, brand.id, rule), 201);
});
