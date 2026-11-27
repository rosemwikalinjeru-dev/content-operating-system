import { getSettings, getUsageSummary } from "@contentos/database";
import { api, json } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

export const GET = api(async () => {
  const { db } = await requireApiSession();
  const [summary, settings] = await Promise.all([getUsageSummary(db), getSettings(db)]);
  return json({ ...summary, budgets: settings });
});
