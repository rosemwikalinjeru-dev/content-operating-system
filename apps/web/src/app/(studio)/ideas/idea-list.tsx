"use client";

import type { Idea, IdeaStatus, Page } from "@contentos/schemas";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

const NEXT_STATUS: Partial<Record<IdeaStatus, { to: IdeaStatus; label: string }>> = {
  inbox: { to: "developing", label: "Start developing" },
  archived: { to: "inbox", label: "Restore to inbox" },
};

export function IdeaList({ initial, status }: { initial: Page<Idea>; status?: IdeaStatus }) {
  const router = useRouter();
  const [ideas, setIdeas] = useState(initial.data);
  const [cursor, setCursor] = useState(initial.next_cursor);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!cursor) return;
    setBusy("more");
    try {
      const qs = new URLSearchParams({ cursor, ...(status ? { status } : {}) });
      const next = await apiFetch<Page<Idea>>(`/api/v1/ideas?${qs}`);
      setIdeas((prev) => [...prev, ...next.data]);
      setCursor(next.next_cursor);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(idea: Idea, to: IdeaStatus) {
    setBusy(idea.id);
    setError(null);
    try {
      await apiFetch(`/api/v1/ideas/${idea.id}`, { method: "PATCH", json: { status: to } });
      // Remove the idea if its new status no longer matches the current filter.
      const leavesView = status ? to !== status : to === "archived";
      setIdeas((prev) =>
        leavesView ? prev.filter((i) => i.id !== idea.id) : prev.map((i) => (i.id === idea.id ? { ...i, status: to } : i)),
      );
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (ideas.length === 0) {
    return <p className="card text-muted">No ideas here yet.</p>;
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {ideas.map((idea) => {
          const next = NEXT_STATUS[idea.status];
          return (
            <li key={idea.id} className="card">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/ideas/${idea.id}`} className="font-semibold hover:underline">
                    {idea.title}
                  </Link>
                  {idea.raw_input !== idea.title && (
                    <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted">{idea.raw_input}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="chip">{idea.status}</span>
                    {idea.tags.map((t) => (
                      <span key={t} className="chip">
                        #{t}
                      </span>
                    ))}
                    <span className="chip">{new Date(idea.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {next && (
                    <button className="btn-ghost" disabled={busy === idea.id} onClick={() => setStatus(idea, next.to)}>
                      {next.label}
                    </button>
                  )}
                  {idea.status !== "archived" && (
                    <button className="btn-ghost" disabled={busy === idea.id} onClick={() => setStatus(idea, "archived")}>
                      Archive
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {cursor && (
        <button className="btn-ghost" onClick={loadMore} disabled={busy === "more"}>
          {busy === "more" ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
