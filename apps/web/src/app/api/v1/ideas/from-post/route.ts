import { createIdeaFromPost, getDefaultBrand } from "@contentos/database";
import { IdeaFromPost } from "@contentos/schemas";
import { api, json, parseJson } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

/**
 * Start an idea from someone else's post (pasted by the owner; nothing is scraped). The post is
 * stored as source material with the formats she wants; agents respond to it, never copy it.
 */
export const POST = api(async ({ req }) => {
  const { db, userId } = await requireApiSession();
  const input = await parseJson(req, IdeaFromPost);
  const brand = await getDefaultBrand(db);
  return json(await createIdeaFromPost(db, userId, brand.id, input), 201);
});
