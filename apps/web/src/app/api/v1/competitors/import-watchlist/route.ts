import { competitorUrls, createCompetitor, getDefaultBrand, listCompetitors, updateCompetitor } from "@contentos/database";
import { platformFromUrl, STARTER_WATCHLIST } from "@contentos/research-engine";
import { api, json } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

/**
 * Import the owner's watchlist (docs/research/watchlist.json). Idempotent by profile URL.
 * Entries without a URL yet are reported as missing rather than guessed. Existing creators whose
 * study focus is still the import placeholder get the watchlist's focus; owner edits are kept.
 */
export const POST = api(async () => {
  const { db, userId } = await requireApiSession();
  const brand = await getDefaultBrand(db);
  const existing = await competitorUrls(db, brand.id);
  const current = await listCompetitors(db, brand.id);
  let imported = 0;
  let skipped = 0;
  let updated = 0;
  const missing: string[] = [];
  for (const c of STARTER_WATCHLIST.competitors) {
    for (const p of c.platforms) {
      if (!p.profile_url) {
        missing.push(c.name);
        continue;
      }
      if (existing.has(p.profile_url)) {
        const row = current.find((r) => r.profile_url === p.profile_url);
        if (row && (!row.study_focus || row.study_focus.startsWith("Added by owner")) && row.study_focus !== c.study_focus) {
          await updateCompetitor(db, row.id, { study_focus: c.study_focus, relationship: c.relationship });
          updated++;
        } else skipped++;
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
  return json({ imported, updated, skipped, missing_urls: [...new Set(missing)] });
});
