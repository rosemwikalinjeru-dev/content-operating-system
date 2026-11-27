"use client";

import type { ResearchQueryRow } from "@contentos/schemas";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

const KIND_LABEL = { audience_language: "Audience language", concept: "Concept", saturation: "Saturation benchmark" } as const;
const PLATFORMS = ["reddit", "youtube", "tiktok", "threads", "instagram"] as const;

export function KeywordsManager({ queries }: { queries: ResearchQueryRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState({ cluster_id: "A", query: "", kind: "audience_language" as keyof typeof KIND_LABEL });

  async function act(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ error: false, text });
      router.refresh();
    } catch (err) {
      setMsg({ error: true, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const clusters = [...new Map(queries.map((q) => [q.cluster_id, q.cluster_name])).entries()];
  const clusterName = (id: string) => clusters.find(([c]) => c === id)?.[1] ?? `Cluster ${id}`;

  return (
    <div className="space-y-6">
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Approved starter set</p>
          <p className="text-sm text-muted">Six clusters (A–F) plus the saturation benchmark. Safe to run again: existing keywords are kept.</p>
        </div>
        <button
          className="btn-ghost whitespace-nowrap"
          disabled={busy !== null}
          onClick={() =>
            act("import", async () => {
              const r = await apiFetch<{ imported: number; skipped: number }>("/api/v1/research/queries/import-starter", { method: "POST" });
              return `Imported ${r.imported}, kept ${r.skipped} existing.`;
            })
          }
        >
          {busy === "import" ? "Importing…" : "Import starter keywords"}
        </button>
      </div>

      <form
        className="card space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act("add", async () => {
            const cluster = clusters.find(([c]) => c === draft.cluster_id);
            await apiFetch("/api/v1/research/queries", {
              method: "POST",
              json: {
                cluster_id: draft.cluster_id,
                cluster_name: cluster?.[1] ?? `Cluster ${draft.cluster_id}`,
                kind: draft.kind,
                query: draft.query,
                priority: draft.kind === "saturation" ? "benchmark" : "medium",
                platforms: draft.kind === "concept" ? ["youtube"] : ["reddit", "tiktok"],
              },
            });
            setDraft({ ...draft, query: "" });
          });
        }}
      >
        <p className="font-semibold">Add a keyword</p>
        <div className="grid gap-3 sm:grid-cols-[160px_200px_1fr_auto] sm:items-end">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Cluster</span>
            <select className="input" value={draft.cluster_id} onChange={(e) => setDraft({ ...draft, cluster_id: e.target.value })}>
              {(clusters.length ? clusters : [["A", "Cluster A"]]).map(([id, name]) => (
                <option key={id} value={id}>
                  {id} · {name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Type</span>
            <select className="input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as keyof typeof KIND_LABEL })}>
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Phrase</span>
            <input className="input" required minLength={2} maxLength={200} value={draft.query} onChange={(e) => setDraft({ ...draft, query: e.target.value })} />
          </label>
          <button type="submit" className="btn-primary" disabled={busy !== null}>
            Add
          </button>
        </div>
      </form>

      {msg && (
        <p role={msg.error ? "alert" : "status"} className={`text-sm ${msg.error ? "text-red-600" : "text-muted"}`}>
          {msg.text}
        </p>
      )}

      {queries.length === 0 ? (
        <p className="card text-muted">No keywords yet.</p>
      ) : (
        clusters.map(([id]) => (
          <div key={id} className="card space-y-3">
            <p className="font-semibold">
              {id} · {clusterName(id)}
            </p>
            <ul className="divide-y divide-[var(--border)]">
              {queries
                .filter((q) => q.cluster_id === id)
                .map((q) => (
                  <li key={q.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className={q.enabled ? "" : "text-muted line-through"}>{q.query}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <span className="chip">{KIND_LABEL[q.kind]}</span>
                        <span className="chip">{q.priority}</span>
                        {q.last_run_at && <span className="chip">last run {new Date(q.last_run_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {PLATFORMS.map((p) => (
                        <label key={p} className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={q.platforms.includes(p)}
                            disabled={busy !== null || (q.platforms.length === 1 && q.platforms.includes(p))}
                            onChange={(e) =>
                              act(q.id, async () => {
                                const platforms = e.target.checked ? [...q.platforms, p] : q.platforms.filter((x) => x !== p);
                                await apiFetch(`/api/v1/research/queries/${q.id}`, { method: "PATCH", json: { platforms } });
                              })
                            }
                          />
                          {p}
                        </label>
                      ))}
                      <button
                        className="btn-ghost"
                        disabled={busy !== null}
                        onClick={() => act(q.id, async () => void (await apiFetch(`/api/v1/research/queries/${q.id}`, { method: "PATCH", json: { enabled: !q.enabled } })))}
                      >
                        {q.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        className="btn-ghost"
                        disabled={busy !== null}
                        onClick={() => act(q.id, async () => void (await apiFetch(`/api/v1/research/queries/${q.id}`, { method: "DELETE" })))}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
