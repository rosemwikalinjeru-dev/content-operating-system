import { addResearchQueries, getDefaultBrand } from "@contentos/database";
import { STARTER_KEYWORDS } from "@contentos/research-engine";
import type { ResearchQueryCreate } from "@contentos/schemas";
import { api, json } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

/**
 * Import the approved starter keyword set (docs/research/research-keywords.json). Idempotent:
 * existing keywords are skipped. Audience-language terms search the forums and short video
 * where owners describe problems; concepts search YouTube; saturation terms are a benchmark.
 */
export const POST = api(async () => {
  const { db, userId } = await requireApiSession();
  const brand = await getDefaultBrand(db);
  const rows: ResearchQueryCreate[] = [];
  for (const c of STARTER_KEYWORDS.clusters) {
    const priority = c.priority === "high" ? "high" : "medium";
    for (const q of c.audience_language) {
      rows.push({ cluster_id: c.id, cluster_name: c.name, priority, kind: "audience_language", query: q, platforms: ["reddit", "tiktok"] });
    }
    for (const q of c.concepts) {
      rows.push({ cluster_id: c.id, cluster_name: c.name, priority, kind: "concept", query: q, platforms: ["youtube"] });
    }
  }
  for (const q of STARTER_KEYWORDS.saturation_benchmark) {
    rows.push({ cluster_id: "SAT", cluster_name: "Saturation benchmark", priority: "benchmark", kind: "saturation", query: q, platforms: ["reddit"] });
  }
  const imported = await addResearchQueries(db, userId, brand.id, rows);
  return json({ imported, skipped: rows.length - imported });
});
