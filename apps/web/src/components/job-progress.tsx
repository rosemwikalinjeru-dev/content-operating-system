"use client";

import type { JobView } from "@contentos/schemas";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

const STEP_LABELS: Record<string, string> = {
  queued: "Waiting to start",
  loading: "Loading your idea and Brand DNA",
  retrieving_knowledge: "Finding related knowledge",
  analyzing: "Analysing the idea",
  writing_brief: "Writing the brief",
  done: "Done",
};

/**
 * Polls a background job until it finishes, then refreshes the page's server data.
 * Shows progress, cost and a readable error (with a budget link when relevant).
 */
export function JobProgress({ jobId, label }: { jobId: string; label: string }) {
  const router = useRouter();
  const [job, setJob] = useState<JobView | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const refreshed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let delay = 1500;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const next = await apiFetch<JobView>(`/api/v1/jobs/${jobId}`);
        if (cancelled) return;
        setJob(next);
        setFetchError(null);
        if (TERMINAL.has(next.status)) {
          if (next.status === "completed" && !refreshed.current) {
            refreshed.current = true;
            router.refresh();
          }
          return;
        }
      } catch (err) {
        if (!cancelled) setFetchError((err as Error).message);
      }
      delay = Math.min(delay * 1.3, 5000);
      timer = setTimeout(poll, delay);
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, router]);

  const status = job?.status ?? "queued";
  const failed = status === "failed" || status === "cancelled";

  return (
    <div className="card space-y-2" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <p className="font-semibold">{label}</p>
        {job && <span className="metric text-sm text-muted">${job.actual_cost_usd.toFixed(4)}</span>}
      </div>
      {!failed && status !== "completed" && (
        <>
          <div className="h-2 w-full overflow-hidden rounded bg-black/10 dark:bg-white/10">
            <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${Math.max(job?.progress ?? 3, 3)}%` }} />
          </div>
          <p className="text-sm text-muted">{STEP_LABELS[job?.current_step ?? "queued"] ?? job?.current_step}</p>
        </>
      )}
      {status === "completed" && <p className="text-sm text-muted">Finished.</p>}
      {failed && (
        <div role="alert" className="text-sm">
          <p className="font-semibold text-red-600">{job?.error?.message ?? "The job failed."}</p>
          {job?.error?.code === "BUDGET_EXCEEDED" && (
            <Link href="/settings/usage" className="underline">
              Review budgets
            </Link>
          )}
        </div>
      )}
      {fetchError && <p className="text-sm text-red-600">{fetchError}</p>}
    </div>
  );
}
