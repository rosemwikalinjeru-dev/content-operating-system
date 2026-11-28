import { getIdeaWithAnalysis } from "@contentos/database";
import { ContentFormat, IdeaAnalysis, readSourcePost, Uuid } from "@contentos/schemas";
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
  const sourcePost = idea ? readSourcePost(idea.metadata) : null;
  const chosen = ContentFormat.array().safeParse((idea?.metadata as { formats?: unknown } | null)?.formats);
  const defaultFormats = chosen.success ? chosen.data : undefined;
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

      {sourcePost && (
        <div className="card space-y-2 border-l-4 border-l-[var(--accent)]">
          <p className="font-semibold">
            Responding to {sourcePost.author}
            {sourcePost.url && (
              <>
                {" "}
                ·{" "}
                <a href={sourcePost.url} target="_blank" rel="noopener noreferrer" className="underline">
                  original post
                </a>
              </>
            )}
          </p>
          <p className="text-sm text-muted">
            Used as a prompt only: your content makes your own point, credits {sourcePost.author} if it mentions their idea, and never
            copies their words (copying blocks approval).
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer">Show their post</summary>
            <p className="mt-2 whitespace-pre-wrap text-muted">{sourcePost.text}</p>
          </details>
        </div>
      )}
      <IdeaActions ideaId={idea.id} hasAnalysis={analysis.success} defaultFormats={defaultFormats} />

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
