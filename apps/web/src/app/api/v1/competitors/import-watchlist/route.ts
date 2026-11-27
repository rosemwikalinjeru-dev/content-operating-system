import { competitorUrls, createCompetitor, getDefaultBrand } from "@contentos/database";
import { platformFromUrl, STARTER_WATCHLIST } from "@contentos/research-engine";
import { api, json } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

/**
 * Import the owner's watchlist (docs/research/watchlist.json). Idempotent by profile URL.
 * Entries without a URL yet are reported as missing rather than guessed.
 */
export const POST = api(async () => {
  const { db, userId } = await requireApiSession();
  const brand = await getDefaultBrand(db);
  const existing = await competitorUrls(db, brand.id);
  let imported = 0;
  let skipped = 0;
  const missing: string[] = [];
  for (const c of STARTER_WATCHLIST.competitors) {
    for (const p of c.platforms) {
      if (!p.profile_url) {
        missing.push(c.name);
        continue;
      }
      if (existing.has(p.profile_url)) {
        skipped++;
        continue;
      }
      await createCompetitor(db, userId, brand.id, {
        name: c.name,
        profile_url: p.profile_url,
        platform: platformFromUrl(p.profile_url) ?? p.platform,
        relationship: c.relationship,
        priority: c.priority,
        ...("study_focus" in c && c.study_focus ? { study_focus: c.study_focus } : {}),
      });
      imported++;
    }
  }
  return json({ imported, skipped, missing_urls: [...new Set(missing)] });
});
