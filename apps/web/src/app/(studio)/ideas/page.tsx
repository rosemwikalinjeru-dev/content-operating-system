import { listIdeas } from "@contentos/database";
import { IdeaStatus } from "@contentos/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { FromPostForm } from "./from-post-form";
import { IdeaCapture } from "./idea-capture";
import { IdeaList } from "./idea-list";

export const metadata: Metadata = { title: "Idea Inbox" };

const FILTERS = [
  { label: "Active", value: undefined },
  { label: "Inbox", value: "inbox" },
  { label: "Developing", value: "developing" },
  { label: "Briefed", value: "briefed" },
  { label: "Archived", value: "archived" },
] as const;

export default async function IdeasPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { db } = await requireSession();
  const parsed = IdeaStatus.safeParse((await searchParams).status);
  const status = parsed.success ? parsed.data : undefined;
  const page = await listIdeas(db, { limit: 25, status });

  return (
    <section className="space-y-6">
      <header>
        <p className="eyebrow">Capture</p>
        <h1 className="font-display text-4xl">Idea Inbox</h1>
      </header>
      <IdeaCapture />
      <FromPostForm />
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter ideas">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={f.value ? `/ideas?status=${f.value}` : "/ideas"}
            role="tab"
            aria-selected={status === f.value}
            className={`btn-ghost ${status === f.value ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <IdeaList key={status ?? "active"} initial={page} status={status} />
    </section>
  );
}
