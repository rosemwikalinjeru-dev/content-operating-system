"use client";

import type { ResearchSchedule } from "@contentos/database";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { JobProgress } from "@/components/job-progress";
import { apiFetch } from "@/lib/api-client";

export function RunPanel({ clusters, activeJobId }: { clusters: Array<[string, string]>; activeJobId: string | null }) {
  const [jobId, setJobId] = useState<string | null>(activeJobId);
  const [selected, setSelected] = useState<string[]>([]);
  const [maxCredits, setMaxCredits] = useState(30);
  const [includeCompetitors, setIncludeCompetitors] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ job_id: string }>("/api/v1/research/run", {
        method: "POST",
        json: { cluster_ids: selected.length ? selected : undefined, include_competitors: includeCompetitors, max_credits: maxCredits },
      });
      setJobId(res.job_id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4">
      <div>
        <p className="font-semibold">Run a research sweep</p>
        <p className="text-sm text-muted">
          Each search or creator feed costs 1 ScrapeCreators credit. Labelling uses the cheap model; only the final ideas use
          the stronger one.
        </p>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Clusters (none selected = all, high priority first)</legend>
        <div className="flex flex-wrap gap-2">
          {clusters.map(([id, name]) => (
            <label key={id} className="chip flex items-center gap-1">
              <input
                type="checkbox"
                checked={selected.includes(id)}
                onChange={(e) => setSelected(e.target.checked ? [...selected, id] : selected.filter((s) => s !== id))}
              />
              {id} · {name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-4">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Credit cap</span>
          <input
            className="input w-28"
            type="number"
            min={5}
            max={100}
            value={maxCredits}
            onChange={(e) => setMaxCredits(Math.max(5, Math.min(100, Number(e.target.value) || 5)))}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeCompetitors} onChange={(e) => setIncludeCompetitors(e.target.checked)} />
          Include tracked creators
        </label>
        <button className="btn-primary" onClick={run} disabled={busy}>
          {busy ? "Starting…" : "Run sweep"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {jobId && <JobProgress key={jobId} jobId={jobId} label="Research sweep" />}
    </div>
  );
}

export function ScheduleToggle({ schedule }: { schedule: ResearchSchedule }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/v1/research/schedule", { method: "PUT", json: { enabled: !schedule.enabled } });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">Weekly sweep {schedule.enabled ? "on" : "off"}</p>
        <p className="text-sm text-muted">
          {schedule.enabled && schedule.next_run_at
            ? `Due from ${new Date(schedule.next_run_at).toLocaleDateString()}; the scheduler checks every Monday. Uses the default credit cap of 30.`
            : "Runs every Monday with the default settings once you turn it on."}
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
      <button className="btn-ghost whitespace-nowrap" onClick={toggle} disabled={busy}>
        {schedule.enabled ? "Turn off" : "Turn on weekly sweep"}
      </button>
    </div>
  );
}
