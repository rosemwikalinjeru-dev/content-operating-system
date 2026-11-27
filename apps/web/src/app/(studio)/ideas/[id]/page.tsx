import { getIdeaWithAnalysis } from "@contentos/database";
import { IdeaAnalysis, Uuid } from "@contentos/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalysisView } from "@/components/analysis-view";
import { JobProgress } from "@/components/job-progress";
import { requireSession } from "@/lib/auth";
import { IdeaActions } from "./idea-actions";

export const metadata: Metadata = { title: "Idea" };

export default async function IdeaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ job?: string }>;
}) {
  const { db } = await requireSession();
  const id = Uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const idea = await getIdeaWithAnalysis(db, id.data).catch(() => null);
  if (!idea) notFound();
  const job = Uuid.safeParse((await searchParams).job);
  const analysis = IdeaAnalysis.safeParse(idea.analysis);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <Link href="/ideas" className="text-sm text-muted underline">
          ← Idea Inbox
        </Link>
        <h1 className="font-display text-4xl">{idea.title}</h1>
        <div className="flex flex-wrap gap-2">
          <span className="chip">{idea.status}</span>
          {idea.tags.map((t) => (
            <span key={t} className="chip">
              #{t}
            </span>
          ))}
        </div>
      </header>

      <div className="card whitespace-pre-line">{idea.raw_input}</div>

      {job.success && <JobProgress jobId={job.data} label="Analysing idea" />}

      <IdeaActions ideaId={idea.id} hasAnalysis={analysis.success} />

      {analysis.success ? (
        <AnalysisView analysis={analysis.data} analyzedAt={idea.analyzed_at} />
      ) : (
        !job.success && (
          <p className="card text-sm text-muted">
            Not analysed yet. Analysis separates facts from opinions, flags generic ideas and lists what is missing.
          </p>
        )
      )}
    </section>
  );
}
