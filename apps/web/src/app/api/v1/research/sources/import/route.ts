import { getDefaultBrand, importManualSources, listCompetitors } from "@contentos/database";
import { contentHash, type ResearchPlatform } from "@contentos/research-engine";
import { ManualSourcesImport } from "@contentos/schemas";
import { AppError } from "@contentos/shared";
import { api, json, parseJson } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

/**
 * Import posts the owner copied by hand (LinkedIn individuals have no API feed). Stored as
 * observed public evidence with provider "manual"; duplicates are skipped by content hash.
 */
export const POST = api(async ({ req }) => {
  const { db, userId } = await requireApiSession();
  const input = await parseJson(req, ManualSourcesImport);
  const brand = await getDefaultBrand(db);
  let platform = "linkedin";
  if (input.competitor_id) {
    const competitor = (await listCompetitors(db, brand.id)).find((c) => c.id === input.competitor_id);
    if (!competitor) throw new AppError("NOT_FOUND", "Competitor not found.");
    platform = competitor.platform;
  }
  const result = await importManualSources(
    db,
    userId,
    brand.id,
    input,
    (p) => contentHash({ platform: p.platform as ResearchPlatform, url: p.url, text: p.text }),
    platform,
  );
  return json(result, 201);
});
