"use client";

import type { CompetitorRow } from "@contentos/schemas";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

const RELATIONSHIP = {
  direct_competitor: "Direct competitor",
  positioning_benchmark: "Positioning benchmark",
  craft_benchmark: "Craft benchmark",
} as const;

export function CompetitorsManager({ competitors }: { competitors: CompetitorRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState({ name: "", profile_url: "", relationship: "direct_competitor" as keyof typeof RELATIONSHIP, study_focus: "" });

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

  return (
    <div className="space-y-6">
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Your watchlist</p>
          <p className="text-sm text-muted">Imports the creators you listed. Ones without a profile link yet are reported, not guessed.</p>
        </div>
        <button
          className="btn-ghost whitespace-nowrap"
          disabled={busy !== null}
          onClick={() =>
            act("import", async () => {
              const r = await apiFetch<{ imported: number; skipped: number; missing_urls: string[] }>("/api/v1/competitors/import-watchlist", {
                method: "POST",
              });
              return `Imported ${r.imported}, kept ${r.skipped}.${r.missing_urls.length ? ` Still need links for: ${r.missing_urls.join(", ")}.` : ""}`;
            })
          }
        >
          {busy === "import" ? "Importing…" : "Import watchlist"}
        </button>
      </div>

      <form
        className="card space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act("add", async () => {
            await apiFetch("/api/v1/competitors", {
              method: "POST",
              json: { ...draft, study_focus: draft.study_focus || undefined },
            });
            setDraft({ name: "", profile_url: "", relationship: draft.relationship, study_focus: "" });
          });
        }}
      >
        <p className="font-semibold">Add a creator</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Name</span>
            <input className="input" required maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Profile link</span>
            <input className="input" required type="url" value={draft.profile_url} onChange={(e) => setDraft({ ...draft, profile_url: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Relationship</span>
            <select className="input" value={draft.relationship} onChange={(e) => setDraft({ ...draft, relationship: e.target.value as keyof typeof RELATIONSHIP })}>
              {Object.entries(RELATIONSHIP).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">What to study</span>
            <input className="input" maxLength={500} value={draft.study_focus} onChange={(e) => setDraft({ ...draft, study_focus: e.target.value })} />
          </label>
        </div>
        <button type="submit" className="btn-primary" disabled={busy !== null}>
          Add creator
        </button>
      </form>

      {msg && (
        <p role={msg.error ? "alert" : "status"} className={`text-sm ${msg.error ? "text-red-600" : "text-muted"}`}>
          {msg.text}
        </p>
      )}

      {competitors.length === 0 ? (
        <p className="card text-muted">No creators tracked yet.</p>
      ) : (
        <ul className="space-y-3">
          {competitors.map((c) => (
            <li key={c.id} className="card flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className={`font-semibold ${c.enabled ? "" : "text-muted line-through"}`}>
                  {c.priority != null && <span className="metric mr-2 text-muted">#{c.priority}</span>}
                  {c.name}
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="chip">{RELATIONSHIP[c.relationship]}</span>
                  <span className="chip">{c.platform}</span>
                  {c.last_collected_at && <span className="chip">collected {new Date(c.last_collected_at).toLocaleDateString()}</span>}
                </div>
                {c.study_focus && <p className="text-sm text-muted">{c.study_focus}</p>}
                <a href={c.profile_url} target="_blank" rel="noopener noreferrer" className="break-all text-xs underline">
                  {c.profile_url}
                </a>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-ghost"
                  disabled={busy !== null}
                  onClick={() => act(c.id, async () => void (await apiFetch(`/api/v1/competitors/${c.id}`, { method: "PATCH", json: { enabled: !c.enabled } })))}
                >
                  {c.enabled ? "Pause" : "Resume"}
                </button>
                <button
                  className="btn-ghost"
                  disabled={busy !== null}
                  onClick={() => act(c.id, async () => void (await apiFetch(`/api/v1/competitors/${c.id}`, { method: "DELETE" })))}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
