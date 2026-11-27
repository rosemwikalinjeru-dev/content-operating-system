import { getDefaultBrand, listCompetitors } from "@contentos/database";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { CompetitorsManager } from "./competitors-manager";

export const metadata: Metadata = { title: "Tracked creators" };

export default async function CompetitorsPage() {
  const { db } = await requireSession();
  const brand = await getDefaultBrand(db);
  const competitors = await listCompetitors(db, brand.id);
  return (
    <section className="space-y-6">
      <header>
        <p className="eyebrow">Research</p>
        <h1 className="font-display text-4xl">Tracked creators</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Direct competitors define what is already covered; positioning and craft benchmarks are studied for hooks and
          delivery, never copied. A topic counts as a gap when your niche engages with it and these creators rarely post about
          it. LinkedIn does not offer creator feeds through the research API — paste their posts on the Import tab.
        </p>
      </header>
      <CompetitorsManager competitors={competitors} />
    </section>
  );
}
