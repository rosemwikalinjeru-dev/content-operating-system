import { createKnowledge, getBrand, getDefaultBrand, listKnowledge } from "@contentos/database";
import { KnowledgeCreate, KnowledgeListQuery } from "@contentos/schemas";
import { api, json, parseJson, parseQuery } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

export const GET = api(async ({ req }) => {
  const { db } = await requireApiSession();
  return json(await listKnowledge(db, parseQuery(req, KnowledgeListQuery)));
});

export const POST = api(async ({ req }) => {
  const { db, userId } = await requireApiSession();
  const { brand_id, ...input } = await parseJson(req, KnowledgeCreate);
  const brand = brand_id ? await getBrand(db, brand_id) : await getDefaultBrand(db);
  return json(await createKnowledge(db, userId, brand.id, input), 201);
});
