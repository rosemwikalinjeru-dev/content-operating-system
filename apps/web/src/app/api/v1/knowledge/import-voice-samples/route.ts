import { createKnowledge, getDefaultBrand, knowledgeTitles } from "@contentos/database";
import { VOICE_SAMPLES } from "@contentos/intelligence";
import { api, json } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

/**
 * Import the owner's voice samples into the default brand's knowledge base. Idempotent:
 * samples already present (by title) are skipped. The story is the owner's own published
 * post, so it is marked verified.
 */
export const POST = api(async () => {
  const { db, userId } = await requireApiSession();
  const brand = await getDefaultBrand(db);
  const existing = await knowledgeTitles(db, brand.id);
  let imported = 0;
  for (const s of VOICE_SAMPLES) {
    if (existing.has(s.title)) continue;
    await createKnowledge(db, userId, brand.id, {
      kind: s.kind,
      title: s.title,
      body: s.body,
      source: s.note ?? "Owner's LinkedIn post",
      verified: true,
      tags: ["voice-sample"],
    });
    imported++;
  }
  return json({ imported, skipped: VOICE_SAMPLES.length - imported });
});
