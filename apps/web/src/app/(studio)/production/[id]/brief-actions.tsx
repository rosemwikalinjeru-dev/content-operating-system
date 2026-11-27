"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

export function BriefActions({
  projectId,
  briefId,
  status,
}: {
  projectId: string;
  briefId: string | null;
  status: "pending" | "approved" | "rejected" | "superseded" | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState("");
  const [showRegenerate, setShowRegenerate] = useState(briefId === null);

  async function run(action: string, fn: () => Promise<void>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const approve = () =>
    run("approve", async () => {
      await apiFetch(`/api/v1/briefs/${briefId}/approve`, { method: "PATCH" });
      router.refresh();
    });

  const reject = () =>
    run("reject", async () => {
      await apiFetch(`/api/v1/briefs/${briefId}/reject`, { method: "PATCH" });
      setShowRegenerate(true);
      router.refresh();
    });

  const regenerate = () =>
    run("regenerate", async () => {
      const res = await apiFetch<{ job_id: string }>(`/api/v1/projects/${projectId}/brief`, {
        method: "POST",
        json: guidance.trim() ? { guidance: guidance.trim() } : {},
        headers: { "idempotency-key": `brief-${crypto.randomUUID()}` },
      });
      setGuidance("");
      router.push(`/production/${projectId}?job=${res.job_id}`);
    });

  return (
    <div className="card space-y-3">
      {status === "pending" && (
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={approve} disabled={busy !== null}>
            {busy === "approve" ? "Approving…" : "Approve brief"}
          </button>
          <button className="btn-ghost" onClick={reject} disabled={busy !== null}>
            Reject
          </button>
        </div>
      )}
      {status === "approved" && (
        <p className="text-sm text-muted">Approved and locked. To change direction, generate a new version.</p>
      )}

      {!showRegenerate && briefId && (
        <button className="btn-ghost" onClick={() => setShowRegenerate(true)}>
          Generate a new version
        </button>
      )}
      {showRegenerate && (
        <div className="space-y-2">
          <label htmlFor="guidance" className="block text-sm font-medium">
            {briefId ? "What should change? (optional)" : "Any direction for the brief? (optional)"}
          </label>
          <textarea
            id="guidance"
            className="input"
            rows={3}
            maxLength={2000}
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            placeholder="e.g. Use a salon example. Make the action for today more specific."
          />
          <button className="btn-primary" onClick={regenerate} disabled={busy !== null}>
            {busy === "regenerate" ? "Starting…" : briefId ? "Generate new version" : "Generate brief"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
