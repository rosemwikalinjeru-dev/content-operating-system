import type { IdeaAnalysis } from "@contentos/schemas";

const CLAIM_LABEL: Record<IdeaAnalysis["claims"][number]["type"], string> = {
  fact: "Fact",
  opinion: "Opinion",
  experience: "Experience",
  assumption: "Assumption",
};

const NEXT_STEP: Record<IdeaAnalysis["recommended_next_step"], string> = {
  create_brief: "Ready for a brief",
  sharpen_idea: "Sharpen the idea first",
  gather_evidence: "Gather evidence first",
};

export function AnalysisView({ analysis, analyzedAt }: { analysis: IdeaAnalysis; analyzedAt: string | null }) {
  return (
    <section className="space-y-4" aria-labelledby="analysis-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="analysis-heading" className="font-display text-3xl">
          Analysis
        </h2>
        <span className="chip">{NEXT_STEP[analysis.recommended_next_step]}</span>
      </div>
      {analyzedAt && <p className="text-xs text-muted">Analysed {new Date(analyzedAt).toLocaleString()}</p>}

      {analysis.genericity.is_generic && (
        <div className="card border-l-4 border-l-[var(--color-gold)]">
          <p className="font-semibold">This idea reads as generic.</p>
          <p className="mb-2 text-sm text-muted">{analysis.genericity.reason}</p>
          <p className="text-sm font-medium">Answer these to make it yours:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {analysis.genericity.sharpening_questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card space-y-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Core argument</p>
          <p className="font-semibold">{analysis.core_argument}</p>
        </div>
        <p className="text-sm">{analysis.summary}</p>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Audience fit</p>
          <p className="text-sm">{analysis.audience_fit}</p>
        </div>
      </div>

      {analysis.claims.length > 0 && (
        <div className="card">
          <p className="mb-2 font-semibold">Claims</p>
          <ul className="space-y-2">
            {analysis.claims.map((c) => (
              <li key={c.text} className="flex flex-wrap items-start gap-2 text-sm">
                <span className="chip">{CLAIM_LABEL[c.type]}</span>
                {c.needs_evidence && <span className="chip border-[var(--color-gold)]">Needs evidence</span>}
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.missing_information.length > 0 && (
        <div className="card">
          <p className="mb-2 font-semibold">Missing information</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {analysis.missing_information.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {analysis.suggested_angles.length > 0 && (
        <div className="card">
          <p className="mb-2 font-semibold">Sharper angles</p>
          <ul className="space-y-2 text-sm">
            {analysis.suggested_angles.map((a) => (
              <li key={a.angle}>
                <span className="font-medium">{a.angle}</span>
                <span className="text-muted"> — {a.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
