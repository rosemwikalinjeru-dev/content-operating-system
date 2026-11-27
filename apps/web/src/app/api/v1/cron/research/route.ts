import { AppError, logger } from "@contentos/shared";
import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { api, json } from "@/lib/api/handler";

// The sweep runs in this function after the response (Plan B).
export const maxDuration = 300;

function authorised(header: string | null): boolean {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Weekly research sweep, called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`.
 * Runs only schedules the owner turned on (approved_at set). Not reachable without the secret.
 */
export const GET = api(async ({ req }) => {
  if (!authorised(req.headers.get("authorization"))) throw new AppError("UNAUTHORIZED", "Invalid cron credentials.");
  const { createDueResearchJobs } = await import("@contentos/jobs/cron");
  const runs = await createDueResearchJobs();
  const toStart = runs.filter((r) => r.created);
  if (toStart.length) {
    after(async () => {
      const { runJobInline } = await import("@contentos/jobs/runner");
      for (const run of toStart) {
        try {
          await runJobInline("research_sweep", run.jobId);
        } catch (err) {
          logger.error("cron_research_failed", { jobId: run.jobId, error: err instanceof Error ? err.message : String(err) });
        }
      }
    });
  }
  return json({ due: runs.length, started: toStart.length });
});
