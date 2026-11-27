import { getSettings, getUsageSummary } from "@contentos/database";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { BudgetForm } from "./budget-form";
import { ModelForm } from "./model-form";

export const metadata: Metadata = { title: "Budgets & usage" };

const TASK_LABEL: Record<string, string> = { idea_analysis: "Idea analysis", master_brief: "Master brief" };
const usd = (n: number | null) => (n == null ? "—" : `$${Number(n).toFixed(4)}`);

function Meter({ label, spent, limit }: { label: string; spent: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 100;
  return (
    <div className="card space-y-2">
      <p className="text-sm text-muted">{label}</p>
      <p className="metric text-3xl">
        ${spent.toFixed(2)} <span className="text-base text-muted">of ${limit.toFixed(2)}</span>
      </p>
      <div
        className="h-2 w-full overflow-hidden rounded bg-black/10 dark:bg-white/10"
        role="meter"
        aria-label={`${label}: ${pct.toFixed(0)}% used`}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full ${pct >= 90 ? "bg-red-600" : "bg-[var(--accent)]"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted">{pct.toFixed(0)}% used</p>
    </div>
  );
}

export default async function UsagePage() {
  const { db } = await requireSession();
  const [summary, settings] = await Promise.all([getUsageSummary(db), getSettings(db)]);

  return (
    <section className="space-y-6">
      <header>
        <p className="eyebrow">Settings</p>
        <h1 className="font-display text-4xl">Budgets & usage</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Every AI call is checked against these limits before it runs, and recorded afterwards. Days and months are
          counted in UTC.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Meter label="Today" spent={summary.today_usd} limit={settings.budget_daily_usd} />
        <Meter label="This month" spent={summary.month_usd} limit={settings.budget_monthly_usd} />
      </div>

      <BudgetForm settings={settings} />

      <ModelForm routes={settings.model_routes} />

      <div className="card">
        <p className="mb-3 font-semibold">This month by task</p>
        {summary.by_task.length === 0 ? (
          <p className="text-sm text-muted">No AI calls yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-1 font-medium">Task</th>
                <th className="py-1 text-right font-medium">Calls</th>
                <th className="py-1 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {summary.by_task.map((t) => (
                <tr key={t.task_type} className="border-t border-[var(--border)]">
                  <td className="py-2">{TASK_LABEL[t.task_type] ?? t.task_type}</td>
                  <td className="metric py-2 text-right">{t.calls}</td>
                  <td className="metric py-2 text-right">{usd(t.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card overflow-x-auto">
        <p className="mb-3 font-semibold">Recent calls</p>
        {summary.recent.length === 0 ? (
          <p className="text-sm text-muted">No AI calls yet.</p>
        ) : (
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-1 font-medium">When</th>
                <th className="py-1 font-medium">Task</th>
                <th className="py-1 font-medium">Result</th>
                <th className="py-1 text-right font-medium">Tokens in / out</th>
                <th className="py-1 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {summary.recent.map((r) => (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="py-2">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-2">{TASK_LABEL[r.task_type] ?? r.task_type}</td>
                  <td className="py-2">{r.status === "success" ? "OK" : r.status === "blocked_budget" ? "Blocked (budget)" : `Error: ${r.error_code}`}</td>
                  <td className="metric py-2 text-right">
                    {r.input_tokens ?? "—"} / {r.output_tokens ?? "—"}
                  </td>
                  <td className="metric py-2 text-right">{usd(r.actual_cost ?? r.estimated_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
