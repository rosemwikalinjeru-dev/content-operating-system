import { listResearchReports } from "@contentos/database";
import { ResearchListQuery } from "@contentos/schemas";
import { api, json, parseQuery } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

export const GET = api(async ({ req }) => {
  const { db } = await requireApiSession();
  return json(await listResearchReports(db, parseQuery(req, ResearchListQuery)));
});
