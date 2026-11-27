import {
  activeResearchJobId,
  getDefaultBrand,
  getResearchSchedule,
  listCompetitors,
  listResearchQueries,
  listResearchReports,
} from "@contentos/database";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { RunPanel, ScheduleToggle } from "./research-controls";

export const metadata: Metadata = { title: "Research" };

export default async function ResearchPage() {
  const { db } = await requireSession();
  const brand = await getDefaultBrand(db);
  const [queries, competitors, reports, schedule, activeJob] = await Promise.all([
    listResearchQueries(db, brand.id),
    listCompetitors(db, brand.id),
    listResearchReports(db, { limit: 20 }),
    getResearchSchedule(db, brand.id),
    activeResearchJobId(db),
  ]);
  const enabledQueries = queries.filter((q) => q.enabled).length;
  const clusters = [...new Map(queries.filter((q) => q.priority !== "benchmark").map((q) => [q.cluster_id, q.cluster_name])).entries()];

  return (
    <section className="space-y-6">
      <header>
        <p className="eyebrow">Research intelligence</p>
        <h1 className="font-display text-4xl">Research</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Finds posts in your niche that perform far above their author&apos;s normal, works out which business problems your
          tracked creators are not covering, and turns the strongest gaps into ideas in your Inbox — each with the public posts
          behind it.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/research/keywords" className="card">
          <p className="text-sm text-muted">Keywords enabled</p>
          <p className="metric text-3xl">{enabledQueries}</p>
        </Link>
        <Link href="/research/competitors" className="card">
          <p className="text-sm text-muted">Tracked creators</p>
          <p className="metric text-3xl">{competitors.filter((c) => c.enabled).length}</p>
        </Link>
        <div className="card">
          <p className="text-sm text-muted">Reports</p>
          <p className="metric text-3xl">{reports.data.length}</p>
        </div>
      </div>

      {enabledQueries === 0 ? (
        <div className="card space-y-2">
          <p className="font-semibold">Start with your keyword set</p>
          <p className="text-sm text-muted">Import the approved problem clusters on the Keywords tab, then run your first sweep.</p>
          <Link href="/research/keywords" className="btn-primary inline-block">
            Go to keywords
          </Link>
        </div>
      ) : (
        <RunPanel clusters={clusters} activeJobId={activeJob} />
      )}

      <ScheduleToggle schedule={schedule} />

      <div className="space-y-3">
        <h2 className="font-display text-2xl">Reports</h2>
        {reports.data.length === 0 ? (
          <p className="card text-muted">No reports yet.</p>
        ) : (
          <ul className="space-y-3">
            {reports.data.map((r) => (
              <li key={r.id}>
                <Link href={`/research/reports/${r.id}`} className="card block hover:border-[var(--accent)]">
                  <p className="font-semibold">{r.title}</p>
                  <p className="text-sm text-muted">{r.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
