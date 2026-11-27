import { createCompetitor, getDefaultBrand, listCompetitors } from "@contentos/database";
import { platformFromUrl } from "@contentos/research-engine";
import { CompetitorCreate } from "@contentos/schemas";
import { api, json, parseJson } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

export const GET = api(async () => {
  const { db } = await requireApiSession();
  const brand = await getDefaultBrand(db);
  return json({ data: await listCompetitors(db, brand.id) });
});

export const POST = api(async ({ req }) => {
  const { db, userId } = await requireApiSession();
  const input = await parseJson(req, CompetitorCreate);
  const brand = await getDefaultBrand(db);
  const platform = platformFromUrl(input.profile_url) ?? "web";
  return json(await createCompetitor(db, userId, brand.id, { ...input, platform }), 201);
});
