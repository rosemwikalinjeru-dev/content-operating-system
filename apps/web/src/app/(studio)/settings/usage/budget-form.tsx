"use client";

import type { UserSettings } from "@contentos/schemas";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

const FIELDS: Array<{ key: keyof UserSettings; label: string; hint: string }> = [
  { key: "budget_text_project_usd", label: "Per text project", hint: "Briefs and written content for one project" },
  { key: "budget_media_project_usd", label: "Per media project", hint: "Used from Phase 5 (images, voice, video)" },
  { key: "budget_daily_usd", label: "Per day", hint: "All AI calls, UTC day" },
  { key: "budget_monthly_usd", label: "Per month", hint: "All AI calls, UTC month" },
];

export function BudgetForm({ settings }: { settings: UserSettings }) {
  const router = useRouter();
  const [values, setValues] = useState(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, String(settings[f.key])])) as Record<keyof UserSettings, string>,
  );
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; msg?: string }>({ kind: "idle" });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "saving" });
    try {
      const payload = Object.fromEntries(FIELDS.map((f) => [f.key, Number(values[f.key])]));
      await apiFetch("/api/v1/settings", { method: "PATCH", json: payload });
      setState({ kind: "saved", msg: "Budgets saved." });
      router.refresh();
    } catch (err) {
      setState({ kind: "error", msg: (err as Error).message });
    }
  }

  return (
    <form onSubmit={save} className="card space-y-4">
      <p className="font-semibold">Spending limits (USD)</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="space-y-1 text-sm">
            <span className="font-medium">{f.label}</span>
            <span className="block text-xs text-muted">{f.hint}</span>
            <input
              className="input metric"
              type="number"
              min={0}
              max={10000}
              step="0.01"
              required
              value={values[f.key]}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <button type="submit" className="btn-primary" disabled={state.kind === "saving"}>
          {state.kind === "saving" ? "Saving…" : "Save budgets"}
        </button>
        {state.msg && (
          <p role={state.kind === "error" ? "alert" : "status"} className={`text-sm ${state.kind === "error" ? "text-red-600" : "text-muted"}`}>
            {state.msg}
          </p>
        )}
      </div>
    </form>
  );
}
