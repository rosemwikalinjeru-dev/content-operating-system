import { getDefaultBrand, listCompetitors } from "@contentos/database";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { ImportForm, ProbeForm } from "./import-forms";

export const metadata: Metadata = { title: "Import posts" };

export default async function ImportPage() {
  const { db } = await requireSession();
  const brand = await getDefaultBrand(db);
  const competitors = await listCompetitors(db, brand.id);
  return (
    <section className="space-y-6">
      <header>
        <p className="eyebrow">Research</p>
        <h1 className="font-display text-4xl">Import posts &amp; diagnostics</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Paste public posts you copied yourself — for example a tracked creator&apos;s recent LinkedIn posts. They count
          towards competitor coverage in the next sweep (for 45 days). ContentOS never logs in to a platform to collect posts.
        </p>
      </header>
      <ImportForm competitors={competitors.map((c) => ({ id: c.id, name: c.name, platform: c.platform }))} />
      <ProbeForm />
    </section>
  );
}
