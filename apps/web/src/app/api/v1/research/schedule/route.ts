import { getDefaultBrand, getResearchSchedule, setResearchSchedule } from "@contentos/database";
import { ResearchScheduleUpdate } from "@contentos/schemas";
import { api, json, parseJson } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

export const GET = api(async () => {
  const { db } = await requireApiSession();
  const brand = await getDefaultBrand(db);
  return json(await getResearchSchedule(db, brand.id));
});

/** Enabling records the owner's approval; the weekly cron only runs approved schedules. */
export const PUT = api(async ({ req }) => {
  const { db, userId } = await requireApiSession();
  const { enabled } = await parseJson(req, ResearchScheduleUpdate);
  const brand = await getDefaultBrand(db);
  return json(await setResearchSchedule(db, userId, brand.id, enabled));
});
