import { getDefaultBrand, listResearchQueries } from "@contentos/database";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { KeywordsManager } from "./keywords-manager";

export const metadata: Metadata = { title: "Research keywords" };

export default async function KeywordsPage() {
  const { db } = await requireSession();
  const brand = await getDefaultBrand(db);
  const queries = await listResearchQueries(db, brand.id);
  return (
    <section className="space-y-6">
      <header>
        <p className="eyebrow">Research</p>
        <h1 className="font-display text-4xl">Keywords</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Problem-led clusters. Audience-language terms are how owners describe a problem (searched on Reddit and TikTok);
          concepts are how you would name it (searched on YouTube). Saturation terms are a benchmark: topics everyone covers,
          used for comparison and never turned into ideas. The audience-language terms are drafts — edit them freely.
        </p>
      </header>
      <KeywordsManager queries={queries} />
    </section>
  );
}
