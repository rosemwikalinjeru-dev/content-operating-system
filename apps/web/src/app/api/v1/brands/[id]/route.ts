import { getBrand, updateBrand } from "@contentos/database";
import { BrandProfileUpdate, Uuid } from "@contentos/schemas";
import { api, json, parseJson, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

type Params = { id: string };

export const GET = api<Params>(async ({ params }) => {
  const { db } = await requireApiSession();
  return json(await getBrand(db, parseParam(params.id, Uuid, "brand")));
});

export const PATCH = api<Params>(async ({ req, params }) => {
  const { db } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "brand");
  const input = await parseJson(req, BrandProfileUpdate);
  return json(await updateBrand(db, id, input));
});
