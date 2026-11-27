import { activeWritingJob, getProject, listProjectAssets } from "@contentos/database";
import { MasterBrief, Uuid } from "@contentos/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefView } from "@/components/brief-view";
import { JobProgress } from "@/components/job-progress";
import { requireSession } from "@/lib/auth";
import { BriefActions } from "./brief-actions";
import { WritingStudio } from "./writing-studio";

export const metadata: Metadata = { title: "Project" };

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting your approval",
  approved: "Approved (locked)",
  rejected: "Rejected",
  superseded: "Superseded",
};

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ job?: string; v?: string }>;
}) {
  const { db } = await requireSession();
  const id = Uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const project = await getProject(db, id.data).catch(() => null);
  if (!project) notFound();
  const sp = await searchParams;
  const job = Uuid.safeParse(sp.job);

  const requested = Number(sp.v);
  const selected = project.briefs.find((b) => b.version === requested) ?? project.briefs[0];
  const parsed = selected ? MasterBrief.safeParse(selected.brief) : null;
  const hasApprovedBrief = project.briefs.some((b) => b.approval_status === "approved");
  const [assets, activeJob] = await Promise.all([listProjectAssets(db, project.id), activeWritingJob(db, project.id)]);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <Link href="/production" className="text-sm text-muted underline">
          ← Production Studio
        </Link>
        <h1 className="font-display text-4xl">{project.title}</h1>
        {project.idea_id && (
          <Link href={`/ideas/${project.idea_id}`} className="text-sm underline">
            View source idea
          </Link>
        )}
      </header>

      {job.success && <JobProgress jobId={job.data} label="Writing brief" />}

      {project.briefs.length > 1 && (
        <nav aria-label="Brief versions" className="flex flex-wrap gap-2">
          {project.briefs.map((b) => (
            <Link
              key={b.id}
              href={`/production/${project.id}?v=${b.version}`}
              aria-current={b.id === selected?.id ? "page" : undefined}
              className={`btn-ghost ${b.id === selected?.id ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}
            >
              v{b.version} · {b.approval_status}
            </Link>
          ))}
        </nav>
      )}

      {selected && parsed?.success ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">Version {selected.version}</span>
            <span className="chip">{STATUS_LABEL[selected.approval_status]}</span>
            {selected.model && <span className="chip">{selected.model}</span>}
          </div>
          <BriefActions projectId={project.id} briefId={selected.id} status={selected.approval_status} />
          <BriefView brief={parsed.data} />
        </>
      ) : (
        !job.success && (
          <div className="space-y-3">
            <p className="card text-muted">No brief yet.</p>
            <BriefActions projectId={project.id} briefId={null} status={null} />
          </div>
        )
      )}

      {(hasApprovedBrief || assets.length > 0) && (
        <WritingStudio projectId={project.id} hasApprovedBrief={hasApprovedBrief} assets={assets} activeJob={activeJob} />
      )}
    </section>
  );
}
