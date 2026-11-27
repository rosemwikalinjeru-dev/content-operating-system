import { createResearchQuery, getDefaultBrand, listResearchQueries } from "@contentos/database";
import { ResearchQueryCreate } from "@contentos/schemas";
import { api, json, parseJson } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

export const GET = api(async () => {
  const { db } = await requireApiSession();
  const brand = await getDefaultBrand(db);
  return json({ data: await listResearchQueries(db, brand.id) });
});

export const POST = api(async ({ req }) => {
  const { db, userId } = await requireApiSession();
  const input = await parseJson(req, ResearchQueryCreate);
  const brand = await getDefaultBrand(db);
  return json(await createResearchQuery(db, userId, brand.id, input), 201);
});
