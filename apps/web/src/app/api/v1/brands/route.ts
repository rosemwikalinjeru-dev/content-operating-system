import { createBrand, listBrands } from "@contentos/database";
import { BrandProfileCreate } from "@contentos/schemas";
import { api, json, parseJson } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

export const GET = api(async () => {
  const { db } = await requireApiSession();
  return json({ data: await listBrands(db) });
});

export const POST = api(async ({ req }) => {
  const { db, userId } = await requireApiSession();
  const input = await parseJson(req, BrandProfileCreate);
  return json(await createBrand(db, userId, input), 201);
});
