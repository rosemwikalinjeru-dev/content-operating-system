"use client";

import type { LearnedRuleRow } from "@contentos/schemas";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

const SOURCE = { edits: "From your edits", rejected_suggestions: "From rejected suggestions", owner: "Written by you" } as const;

export function RulesManager({ rules }: { rules: LearnedRuleRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const setStatus = (id: string, status: "approved" | "rejected" | "disabled") =>
    act(id, () => apiFetch(`/api/v1/rules/${id}`, { method: "PATCH", json: { status } }));

  const groups: Array<[string, LearnedRuleRow[]]> = [
    ["Waiting for your approval", rules.filter((r) => r.status === "proposed")],
    ["In use", rules.filter((r) => r.status === "approved")],
    ["Off", rules.filter((r) => r.status === "disabled" || r.status === "rejected")],
  ];

  return (
    <div className="space-y-6">
      <form
        className="card flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void act("add", async () => {
            await apiFetch("/api/v1/rules", { method: "POST", json: { rule: draft } });
            setDraft("");
          });
        }}
      >
        <input
          className="input"
          required
          minLength={5}
          maxLength={300}
          placeholder="Add your own rule, e.g. Say clients, not customers."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn-primary whitespace-nowrap" disabled={busy !== null}>
          Add rule
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {groups.map(([title, list]) => (
        <div key={title} className="space-y-2">
          <h2 className="font-display text-2xl">
            {title} <span className="metric text-base text-muted">{list.length}</span>
          </h2>
          {list.length === 0 ? (
            <p className="text-sm text-muted">None.</p>
          ) : (
            <ul className="space-y-2">
              {list.map((r) => (
                <li key={r.id} className="card space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{r.rule}</p>
                      <span className="chip">{SOURCE[r.source]}</span>
                    </div>
                    <div className="flex gap-2">
                      {r.status !== "approved" && (
                        <button className="btn-primary" disabled={busy !== null} onClick={() => setStatus(r.id, "approved")}>
                          Approve
                        </button>
                      )}
                      {r.status === "proposed" && (
                        <button className="btn-ghost" disabled={busy !== null} onClick={() => setStatus(r.id, "rejected")}>
                          Reject
                        </button>
                      )}
                      {r.status === "approved" && (
                        <button className="btn-ghost" disabled={busy !== null} onClick={() => setStatus(r.id, "disabled")}>
                          Turn off
                        </button>
                      )}
                    </div>
                  </div>
                  {r.rationale && <p className="text-sm text-muted">{r.rationale}</p>}
                  {r.evidence.length > 0 && (
                    <details className="text-sm text-muted">
                      <summary className="cursor-pointer">Evidence ({r.evidence.length})</summary>
                      <ul className="mt-2 space-y-2">
                        {r.evidence.map((e, i) => (
                          <li key={i}>
                            {e.issue ? (
                              <span>Rejected: {e.issue}</span>
                            ) : (
                              <>
                                <span className="line-through">{e.before}</span> → <span>{e.after}</span>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
