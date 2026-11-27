"use client";

import type { ModelChoice, ModelRoutes } from "@contentos/schemas";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

const MODELS: Array<{ id: ModelChoice; label: string; note: string }> = [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (default)", note: "$2 / $10 per million tokens — half the cost of Opus" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "$0.10 / $0.50 — cheapest; weaker at judgement and voice" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", note: "$4 / $20 — strongest; most expensive" },
];

const TASKS: Array<{ key: keyof ModelRoutes; label: string; hint: string }> = [
  { key: "idea_analysis", label: "Idea analysis", hint: "Claims, genericity check, angles" },
  { key: "master_brief", label: "Master brief", hint: "Argument, hooks, content type" },
  { key: "research_labeling", label: "Research labelling", hint: "Bulk tagging of collected posts (Haiku is enough)" },
  { key: "gap_synthesis", label: "Research gap ideas", hint: "Turns niche gaps into Inbox ideas" },
  { key: "idea_screening", label: "Research idea screen", hint: "Keeps generic research ideas out of the Inbox" },
  { key: "format_writing", label: "Format writing", hint: "LinkedIn, X thread, carousel and video drafts" },
  { key: "section_revision", label: "Section revision", hint: "Rewrites one section on request" },
  { key: "editorial_review", label: "Editorial review", hint: "Scores every draft; Opus gives a more independent view" },
  { key: "rule_proposal", label: "Voice rule proposals", hint: "Learns rules from your edits (Haiku is enough)" },
];

export function ModelForm({ routes }: { routes: ModelRoutes }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<keyof ModelRoutes, ModelChoice>>({
    idea_analysis: routes.idea_analysis ?? "claude-sonnet-5-5",
    master_brief: routes.master_brief ?? "claude-sonnet-5-5",
    research_labeling: routes.research_labeling ?? "claude-haiku-5-5",
    gap_synthesis: routes.gap_synthesis ?? "claude-sonnet-5-5",
    idea_screening: routes.idea_screening ?? "claude-sonnet-5-5",
    format_writing: routes.format_writing ?? "claude-sonnet-5-5",
    section_revision: routes.section_revision ?? "claude-sonnet-5-5",
    editorial_review: routes.editorial_review ?? "claude-sonnet-5-5",
    rule_proposal: routes.rule_proposal ?? "claude-haiku-5-5",
  });
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; msg?: string }>({ kind: "idle" });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "saving" });
    try {
      await apiFetch("/api/v1/settings", { method: "PATCH", json: { model_routes: values } });
      setState({ kind: "saved", msg: "Models saved. New jobs use them." });
      router.refresh();
    } catch (err) {
      setState({ kind: "error", msg: (err as Error).message });
    }
  }

  return (
    <form onSubmit={save} className="card space-y-4">
      <div>
        <p className="font-semibold">AI models</p>
        <p className="text-sm text-muted">Choose the model for each task. Cheaper models protect your credits; compare the results before switching a task to Haiku.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {TASKS.map((t) => (
          <label key={t.key} className="space-y-1 text-sm">
            <span className="font-medium">{t.label}</span>
            <span className="block text-xs text-muted">{t.hint}</span>
            <select
              className="input"
              value={values[t.key]}
              onChange={(e) => setValues({ ...values, [t.key]: e.target.value as ModelChoice })}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="block text-xs text-muted">{MODELS.find((m) => m.id === values[t.key])?.note}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <button type="submit" className="btn-primary" disabled={state.kind === "saving"}>
          {state.kind === "saving" ? "Saving…" : "Save models"}
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
