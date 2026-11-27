import { failJobIfActive, getJobView, isStale } from "@contentos/database";
import { Uuid } from "@contentos/schemas";
import { api, json, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

type Params = { id: string };

export const GET = api<Params>(async ({ params }) => {
  const { db } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "job");
  const job = await getJobView(db, id);
  // A job with no progress for several minutes was cut off (e.g. the function timed out).
  if (isStale(job)) {
    await failJobIfActive(db, id, { code: "TIMED_OUT", message: "The job stopped without finishing. Try again." });
    return json(await getJobView(db, id));
  }
  return json(job);
});
