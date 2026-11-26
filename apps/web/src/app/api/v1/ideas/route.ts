import { createIdea, getBrand, getDefaultBrand, listIdeas } from "@contentos/database";
import { IdeaCreate, IdeaListQuery } from "@contentos/schemas";
import { api, json, parseJson, parseQuery } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

export const GET = api(async ({ req }) => {
  const { db } = await requireApiSession();
  return json(await listIdeas(db, parseQuery(req, IdeaListQuery)));
});

export const POST = api(async ({ req }) => {
  const { db, userId } = await requireApiSession();
  const input = await parseJson(req, IdeaCreate);
  // Resolve the brand through RLS so a foreign brand id is a clean 404, not an FK error.
  const brand = input.brand_id ? await getBrand(db, input.brand_id) : await getDefaultBrand(db);
  return json(await createIdea(db, userId, brand.id, input), 201);
});
