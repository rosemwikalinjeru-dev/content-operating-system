"use client";

import { DIMENSION_LABELS, type ContentVersionView, type ReviewDimension } from "@contentos/schemas";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

const GATE_LABEL: Record<string, string> = {
  banned_phrase: "Banned phrase",
  invented_number: "Number without a source",
  invented_story: "Invented story or result",
  unsupported_claim: "Unsupported claim",
  repeated_hook: "Repeats an earlier opening",
  repeated_phrase: "Repeats an earlier phrase",
  copied_from_source: "Copied from the post you are responding to",
  echoes_niche: "Lifted from a post in your niche",
};

export function ReviewPanel({
  version: v,
  onJob,
  onChange,
}: {
  version: ContentVersionView;
  onJob: (id: string, label: string) => void;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [overrideFor, setOverrideFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const r = v.review;

  async function act(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ error: false, text });
    } catch (err) {
      setMsg({ error: true, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const review = () =>
    act("review", async () => {
      const res = await apiFetch<{ job_id: string }>(`/api/v1/versions/${v.id}/review`, {
        method: "POST",
        headers: r ? { "idempotency-key": `review-${crypto.randomUUID()}` } : undefined,
      });
      onJob(res.job_id, "Reviewing the draft");
    });

  const decide = (id: string, action: "accept" | "reject") =>
    act(id, async () => {
      const res = await apiFetch<{ status: string; version?: number; review_job_id?: string }>(`/api/v1/suggestions/${id}`, {
        method: "PATCH",
        json: { action },
      });
      if (res.review_job_id) onJob(res.review_job_id, `Reviewing v${res.version}`);
      onChange();
      return action === "accept" ? `Applied as v${res.version}.` : "Rejected. Your choice helps ContentOS learn your rules.";
    });

  const override = (gate: string) =>
    act(`override-${gate}`, async () => {
      await apiFetch(`/api/v1/versions/${v.id}/overrides`, { method: "POST", json: { gate, reason } });
      setOverrideFor(null);
      setReason("");
      onChange();
      return "Override recorded.";
    });

  if (!r) {
    return (
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Not reviewed yet</p>
          <p className="text-sm text-muted">
            {v.created_by === "human" ? "Your edits are reviewed when you ask." : "The review runs after writing; refresh in a moment, or run it now."}
          </p>
        </div>
        <button className="btn-ghost" onClick={review} disabled={busy !== null}>
          {busy === "review" ? "Starting…" : "Review"}
        </button>
      </div>
    );
  }

  const overridden = new Set(r.overrides.map((o) => o.gate));
  const openGates = r.gate_failures.filter((g) => !overridden.has(g.code));
  const gateCodes = [...new Set(openGates.map((g) => g.code))];
  const pending = r.suggestions.filter((s) => s.status === "pending");

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          Editorial review <span className="metric ml-2 text-2xl">{Math.round(r.total_score)}</span>
          <span className="text-sm text-muted">/100</span>
        </p>
        <div className="flex items-center gap-2">
          {r.reviewer_model && <span className="chip">{r.reviewer_model}</span>}
          <button className="btn-ghost" onClick={review} disabled={busy !== null}>
            {busy === "review" ? "Starting…" : "Review again"}
          </button>
        </div>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {r.dimensions.map((d) => (
          <li key={d.dimension} className="text-sm">
            <div className="flex justify-between">
              <span className="font-medium">{DIMENSION_LABELS[d.dimension as ReviewDimension] ?? d.dimension}</span>
              <span className="metric">{d.score}/5</span>
            </div>
            <div className="my-1 h-1.5 overflow-hidden rounded bg-black/10 dark:bg-white/10">
              <div className="h-full bg-[var(--accent)]" style={{ width: `${(d.score / 5) * 100}%` }} />
            </div>
            <p className="text-xs text-muted">
              {d.reason}
              {d.evidence ? ` “${d.evidence}”` : ""}
            </p>
          </li>
        ))}
      </ul>

      {r.cold_reader && (
        <p className="text-sm">
          <span className="font-medium">Cold reader (TOFU):</span> <span className="metric">{r.cold_reader.score}/5</span>{" "}
          <span className="text-muted">— {r.cold_reader.reason}</span>
        </p>
      )}

      {r.gate_failures.length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold text-red-600">{openGates.length ? "Gates to fix before approving" : "Gates (all overridden)"}</p>
          <ul className="space-y-1 text-sm">
            {r.gate_failures.map((g, i) => (
              <li key={i} className={overridden.has(g.code) ? "text-muted line-through" : ""}>
                <span className="font-medium">{GATE_LABEL[g.code] ?? g.code}</span>
                {g.section ? ` (${g.section})` : ""}: {g.message}
              </li>
            ))}
          </ul>
          {r.overrides.map((o) => (
            <p key={o.gate} className="text-xs text-muted">
              Overridden {GATE_LABEL[o.gate] ?? o.gate}: “{o.reason}”
            </p>
          ))}
          {gateCodes.map((code) =>
            overrideFor === code ? (
              <div key={code} className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="input"
                  placeholder="Why this is fine (e.g. the 40% is from my own client report)"
                  minLength={5}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <button className="btn-ghost whitespace-nowrap" disabled={busy !== null || reason.trim().length < 5} onClick={() => override(code)}>
                  Record override
                </button>
              </div>
            ) : (
              <button key={code} className="btn-ghost mr-2 text-xs" onClick={() => setOverrideFor(code)}>
                Override “{GATE_LABEL[code] ?? code}” with a reason
              </button>
            ),
          )}
        </div>
      )}

      {r.repetition.length > 0 && (
        <div className="space-y-1 text-sm">
          <p className="font-semibold">Repeats earlier content</p>
          {r.repetition.map((f, i) => (
            <p key={i} className="text-muted">
              {f.kind === "hook" ? "Same hook as" : "Phrase used before in"} {f.seen_in}
              {f.section ? ` (${f.section})` : ""}: “{f.phrase}”
            </p>
          ))}
        </div>
      )}

      {r.suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold">
            Suggestions {pending.length ? `(${pending.length} open)` : ""}
          </p>
          <ul className="space-y-2">
            {r.suggestions.map((s) => (
              <li key={s.id} className="rounded border border-[var(--border)] p-3 text-sm">
                <p>
                  <span className="chip mr-2">{s.section_key}</span>
                  <span className="font-medium">{DIMENSION_LABELS[s.dimension as ReviewDimension] ?? s.dimension}:</span> {s.issue}
                </p>
                {s.rewrite.headline && <p className="mt-2 font-display">{s.rewrite.headline}</p>}
                <p className="mt-1 whitespace-pre-wrap">{s.rewrite.text}</p>
                {s.status === "pending" ? (
                  <div className="mt-2 flex gap-2">
                    <button className="btn-primary" disabled={busy !== null} onClick={() => decide(s.id, "accept")}>
                      Accept
                    </button>
                    <button className="btn-ghost" disabled={busy !== null} onClick={() => decide(s.id, "reject")}>
                      Reject
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">
                    {s.status === "accepted" ? `Accepted → v${s.applied_version}` : "Rejected"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {msg && (
        <p role={msg.error ? "alert" : "status"} className={`text-sm ${msg.error ? "text-red-600" : "text-muted"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
