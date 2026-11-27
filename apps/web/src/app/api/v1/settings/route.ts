import { getSettings, updateSettings } from "@contentos/database";
import { SettingsUpdate } from "@contentos/schemas";
import { api, json, parseJson } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

export const GET = api(async () => {
  const { db } = await requireApiSession();
  return json(await getSettings(db));
});

/** Budget changes come only from the owner (approval policy for additional spend). */
export const PATCH = api(async ({ req }) => {
  const { db, userId } = await requireApiSession();
  return json(await updateSettings(db, userId, await parseJson(req, SettingsUpdate)));
});
