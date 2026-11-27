import type { MasterBrief } from "@contentos/schemas";

const EVIDENCE_LABEL: Record<MasterBrief["evidence"][number]["status"], string> = {
  verified_knowledge: "Verified",
  owner_experience: "Your experience",
  opinion: "Opinion",
  needs_evidence: "Needs evidence",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function BriefView({ brief }: { brief: MasterBrief }) {
  const structure: Array<[string, string]> = [
    ["1. Problem", brief.problem],
    ["2. Why it matters", brief.why_it_matters],
    ["3. Root cause", brief.root_cause],
    ["4. Response", brief.response],
    ["5. Technology's role", brief.technology_role],
    ["6. Success measure", brief.success_measure],
  ];
  const needsEvidence = brief.evidence.filter((e) => e.status === "needs_evidence").length;

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <p className="text-xs uppercase tracking-wide text-muted">Core argument</p>
        <p className="font-display text-2xl">{brief.core_argument}</p>
        <div className="flex flex-wrap gap-2">
          <span className="chip">{brief.objective.replace("_", " ")}</span>
          <span className="chip">{brief.content_pillar}</span>
          {brief.selected_formats.map((f) => (
            <span key={f} className="chip">
              {f.replace("_", " ")}
            </span>
          ))}
        </div>
      </div>

      {brief.open_questions.length > 0 && (
        <div className="card border-l-4 border-l-[var(--color-gold)]">
          <p className="mb-2 font-semibold">Confirm before production</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {brief.open_questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <p className="mb-3 font-semibold">Messaging structure</p>
        <dl className="space-y-3">
          {structure.map(([label, value]) => (
            <Row key={label} label={label}>
              {value}
            </Row>
          ))}
        </dl>
      </div>

      <div className="card">
        <dl className="space-y-3">
          <Row label="Audience">{brief.audience}</Row>
          <Row label="Position">{brief.position}</Row>
          <Row label="Story angle">{brief.story_angle}</Row>
          <Row label="Action for today">{brief.desired_action}</Row>
          <Row label="Supporting points">
            <ul className="list-disc pl-5">
              {brief.supporting_points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Row>
          <Row label="Voice constraints">
            <ul className="list-disc pl-5">
              {brief.voice_constraints.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </Row>
        </dl>
      </div>

      <div className="card">
        <p className="mb-3 font-semibold">Hooks</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {brief.hooks.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-semibold">Evidence</p>
          {needsEvidence > 0 && <span className="chip border-[var(--color-gold)]">{needsEvidence} {needsEvidence === 1 ? "needs" : "need"} evidence</span>}
        </div>
        <ul className="space-y-2 text-sm">
          {brief.evidence.map((e) => (
            <li key={e.claim} className="flex flex-wrap items-start gap-2">
              <span className="chip">{EVIDENCE_LABEL[e.status]}</span>
              <span>{e.claim}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
