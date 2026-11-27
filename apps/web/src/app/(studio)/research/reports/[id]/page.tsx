import { getResearchReport } from "@contentos/database";
import { Uuid } from "@contentos/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Research report" };

const TIER_LABEL = { huge: "5×+", strong: "2×+", mild: "1.5×+", none: "—" } as const;

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Uuid.safeParse(id).success) notFound();
  const { db } = await requireSession();
  const report = await getResearchReport(db, id).catch(() => null);
  if (!report) notFound();
  const { stats, outliers, gaps, notes, rejected_ideas: rejected = [] } = report.findings;
  const byId = new Map(outliers.map((o) => [o.source_id, o]));

  return (
    <section className="space-y-8">
      <header>
        <Link href="/research" className="text-sm underline">
          ← Research
        </Link>
        <h1 className="font-display mt-2 text-4xl">{report.title}</h1>
        <p className="mt-2 text-sm text-muted">
          <span className="metric">{stats.sources}</span> posts (<span className="metric">{stats.new_sources}</span> new) ·{" "}
          <span className="metric">{stats.queries}</span> keywords · <span className="metric">{stats.competitors}</span> creator feeds ·{" "}
          <span className="metric">{stats.credits}</span> credits
        </p>
        <p className="mt-1 max-w-2xl text-xs text-muted">
          Observed: the posts and their engagement. Interpretation: topics, gap scores and ideas are model and formula outputs —
          check the evidence before you rely on them.
        </p>
      </header>

      {report.ideas.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-2xl">Ideas added to your Inbox</h2>
          <ul className="space-y-2">
            {report.ideas.map((i) => (
              <li key={i.id}>
                <Link href={`/ideas/${i.id}`} className="card block hover:border-[var(--accent)]">
                  <p className="font-semibold">{i.title}</p>
                  <span className="chip">{i.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rejected.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer font-semibold">{rejected.length} idea(s) kept out of the Inbox as generic</summary>
          <ul className="mt-3 space-y-2 text-sm">
            {rejected.map((r, i) => (
              <li key={i}>
                <span className="font-medium">{r.title}</span> <span className="text-muted">({r.gap_topic}) — {r.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="space-y-3">
        <h2 className="font-display text-2xl">Gaps</h2>
        <p className="text-sm text-muted">Problems your niche engages with or asks about that your tracked creators rarely cover.</p>
        {gaps.length === 0 ? (
          <p className="card text-muted">No gaps strong enough this time.</p>
        ) : (
          <ul className="space-y-3">
            {gaps.map((g) => (
              <li key={g.topic} className="card space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{g.topic}</p>
                  <span className="metric text-sm">score {g.score.toFixed(2)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.cluster_id && <span className="chip">cluster {g.cluster_id}</span>}
                  <span className="chip">{Math.round(g.competitor_coverage * 100)}% competitor coverage</span>
                  <span className="chip">{g.outlier_count} outliers</span>
                  <span className="chip">{g.question_count} questions</span>
                </div>
                <ul className="space-y-1 text-sm">
                  {(g.evidence ?? g.evidence_ids.slice(0, 5).map((sid) => {
                    const o = byId.get(sid);
                    return { source_id: sid, platform: o?.platform ?? "post", url: o?.url ?? null, excerpt: o?.excerpt ?? "", lift: o?.lift ?? null };
                  })).map((e) => (
                    <li key={e.source_id} className="text-muted">
                      {e.url ? (
                        <a href={e.url} target="_blank" rel="noopener noreferrer" className="underline">
                          {e.platform}
                          {e.lift != null ? ` · ${e.lift}× baseline` : ""}
                        </a>
                      ) : (
                        <span>{e.platform}</span>
                      )}
                      {e.excerpt ? ` — ${e.excerpt.slice(0, 140)}` : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-2xl">Outliers</h2>
        <p className="text-sm text-muted">Posts that beat their author&apos;s own median (or the search&apos;s median when the author sample is small).</p>
        {outliers.length === 0 ? (
          <p className="card text-muted">No outliers found.</p>
        ) : (
          <ul className="space-y-3">
            {outliers.map((o) => (
              <li key={o.source_id} className="card space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{o.topic ?? "Unlabelled"}</p>
                  <span className="metric text-sm">
                    {o.lift != null ? `${o.lift}×` : "—"} {TIER_LABEL[o.tier as keyof typeof TIER_LABEL] ? `(${TIER_LABEL[o.tier as keyof typeof TIER_LABEL]})` : ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="chip">{o.platform}</span>
                  <span className="chip">vs {o.baseline_kind} baseline</span>
                  {o.confidence === "low" && <span className="chip">low confidence</span>}
                  {o.from_competitor && <span className="chip">tracked creator</span>}
                </div>
                <p className="text-sm">{o.excerpt}</p>
                {o.url && (
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="break-all text-xs underline">
                    {o.url}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {notes.length > 0 && (
        <div className="card space-y-1">
          <p className="font-semibold">Collection notes</p>
          <ul className="list-disc pl-5 text-sm text-muted">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
