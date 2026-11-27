"use client";

import { CONTENT_FORMATS, type ContentFormat } from "@contentos/schemas";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

const FORMAT_LABELS: Record<ContentFormat, string> = {
  linkedin: "LinkedIn post",
  x_thread: "X thread",
  carousel: "Carousel",
  short_video: "Short video",
};

export function IdeaActions({ ideaId, hasAnalysis }: { ideaId: string; hasAnalysis: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"analyze" | "brief" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formats, setFormats] = useState<ContentFormat[]>(["linkedin", "x_thread"]);

  async function analyze(force: boolean) {
    setBusy("analyze");
    setError(null);
    try {
      const res = await apiFetch<{ job_id: string }>(`/api/v1/ideas/${ideaId}/analyze${force ? "?force=1" : ""}`, {
        method: "POST",
      });
      router.push(`/ideas/${ideaId}?job=${res.job_id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function createBrief() {
    setBusy("brief");
    setError(null);
    try {
      const project = await apiFetch<{ id: string }>("/api/v1/projects", {
        method: "POST",
        json: { idea_id: ideaId, formats },
      });
      const job = await apiFetch<{ job_id: string }>(`/api/v1/projects/${project.id}/brief`, {
        method: "POST",
        json: {},
        headers: { "idempotency-key": `brief-${crypto.randomUUID()}` },
      });
      router.push(`/production/${project.id}?job=${job.job_id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy !== null} onClick={() => analyze(hasAnalysis)}>
          {busy === "analyze" ? "Starting…" : hasAnalysis ? "Re-analyse" : "Analyse idea"}
        </button>
      </div>

      <fieldset className="space-y-2">
        <legend className="font-semibold">Create a brief</legend>
        <p className="text-sm text-muted">Choose the formats this idea should become. The brief is written for all of them.</p>
        <div className="flex flex-wrap gap-3">
          {CONTENT_FORMATS.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formats.includes(f)}
                onChange={(e) => setFormats((prev) => (e.target.checked ? [...prev, f] : prev.filter((x) => x !== f)))}
              />
              {FORMAT_LABELS[f]}
            </label>
          ))}
        </div>
        <button className="btn-ghost" disabled={busy !== null || formats.length === 0} onClick={createBrief}>
          {busy === "brief" ? "Creating…" : "Create project and brief"}
        </button>
        {!hasAnalysis && <p className="text-xs text-muted">Tip: analyse first. The brief uses the analysis when it exists.</p>}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
