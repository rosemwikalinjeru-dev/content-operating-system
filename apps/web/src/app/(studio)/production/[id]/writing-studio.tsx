"use client";

import { toMarkdown, type ContentAssetView, type ContentVersionView, type DraftSection } from "@contentos/schemas";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { JobProgress } from "@/components/job-progress";
import { apiFetch } from "@/lib/api-client";
import { DesignStudio } from "./design-studio";
import { ReviewPanel } from "./review-panel";

const KIND_LABEL: Record<DraftSection["kind"], string> = {
  hook: "Hook",
  paragraph: "Paragraph",
  closing: "Close",
  tweet: "Tweet",
  slide: "Slide",
  beat: "Beat",
  cta: "Call to action",
};

interface Props {
  projectId: string;
  hasApprovedBrief: boolean;
  assets: ContentAssetView[];
  activeJob: { id: string; job_type: string } | null;
}

export function WritingStudio({ projectId, hasApprovedBrief, assets, activeJob }: Props) {
  const router = useRouter();
  const [job, setJob] = useState<{ id: string; label: string } | null>(
    activeJob ? { id: activeJob.id, label: activeJob.job_type === "write_content" ? "Writing formats" : "Revising section" } : null,
  );
  const [tab, setTab] = useState(assets[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function write(force: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ job_id: string }>(`/api/v1/projects/${projectId}/write`, {
        method: "POST",
        json: { force },
        headers: force ? { "idempotency-key": `write-force-${crypto.randomUUID()}` } : undefined,
      });
      setJob({ id: r.job_id, label: "Writing formats" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const current = assets.find((a) => a.id === tab) ?? assets[0];

  return (
    <section className="space-y-4" aria-labelledby="writing-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="writing-heading" className="font-display text-3xl">
            Writing
          </h2>
          <p className="text-sm text-muted">
            {hasApprovedBrief
              ? "Each format is written from the approved brief. Unchanged formats are not rewritten."
              : "Approve a brief to start writing."}
          </p>
        </div>
        {hasApprovedBrief && (
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => write(false)} disabled={busy}>
              {assets.length ? "Write missing formats" : "Write all formats"}
            </button>
            {assets.length > 0 && (
              <button className="btn-ghost" onClick={() => write(true)} disabled={busy}>
                Write fresh drafts
              </button>
            )}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {job && <JobProgress key={job.id} jobId={job.id} label={job.label} />}

      {assets.length > 0 && current && (
        <>
          <nav aria-label="Formats" className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
            {assets.map((a) => (
              <button
                key={a.id}
                onClick={() => setTab(a.id)}
                aria-current={a.id === current.id ? "page" : undefined}
                className={`btn-ghost ${a.id === current.id ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}
              >
                {a.label}
                {a.approved_version ? " ✓" : ""}
              </button>
            ))}
          </nav>
          <AssetPanel
            key={current.id}
            asset={current}
            onJob={(id, label) => setJob({ id, label: label ?? "Revising section" })}
            onChange={() => router.refresh()}
          />
        </>
      )}
    </section>
  );
}

function AssetPanel({ asset, onJob, onChange }: { asset: ContentAssetView; onJob: (id: string, label?: string) => void; onChange: () => void }) {
  const [selected, setSelected] = useState(asset.versions[0]?.version ?? 1);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const v = asset.versions.find((x) => x.version === selected) ?? asset.versions[0];
  if (!v) return <p className="card text-muted">No versions yet.</p>;
  const parent = v.parent_version ? asset.versions.find((x) => x.version === v.parent_version) : asset.versions.find((x) => x.version === v.version - 1);

  async function act(fn: () => Promise<string | void>) {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ error: false, text });
    } catch (err) {
      setMsg({ error: true, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const approve = () =>
    act(async () => {
      await apiFetch(`/api/v1/versions/${v.id}/approve`, { method: "PATCH" });
      onChange();
      return `Version ${v.version} approved.`;
    });

  const copy = () =>
    act(async () => {
      await navigator.clipboard.writeText(toMarkdown(v.body));
      return "Copied.";
    });

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">
            <span className="sr-only">Version</span>
            <select className="input" value={v.version} onChange={(e) => setSelected(Number(e.target.value))}>
              {asset.versions.map((x) => (
                <option key={x.id} value={x.version}>
                  v{x.version} · {x.created_by === "human" ? "your edit" : "AI"} · {x.status}
                </option>
              ))}
            </select>
          </label>
          {v.model && <span className="chip">{v.model}</span>}
          {v.change_note && <span className="text-xs text-muted">{v.change_note}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={copy} disabled={busy}>
            Copy
          </button>
          <a className="btn-ghost" href={`/api/v1/assets/${asset.id}/export?version=${v.version}`}>
            Download .md
          </a>
          <button className="btn-ghost" onClick={() => setEditing(!editing)} disabled={busy}>
            {editing ? "Cancel edit" : "Edit by hand"}
          </button>
          {v.status !== "approved" && (
            <button className="btn-primary" onClick={approve} disabled={busy || v.body.placeholders.length > 0}>
              Approve v{v.version}
            </button>
          )}
        </div>
      </div>

      {msg && (
        <p role={msg.error ? "alert" : "status"} className={`text-sm ${msg.error ? "text-red-600" : "text-muted"}`}>
          {msg.text}
        </p>
      )}

      {(v.body.placeholders.length > 0 || v.body.checks.length > 0) && (
        <div className="card space-y-2 text-sm">
          {v.body.placeholders.length > 0 && (
            <p>
              <span className="font-semibold">Fill before approving:</span> {v.body.placeholders.join(" · ")}
            </p>
          )}
          {v.body.checks.map((c, i) => (
            <p key={i} className="text-muted">
              ⚠ {c.section ? `${c.section}: ` : ""}
              {c.message}
            </p>
          ))}
        </div>
      )}

      <ReviewPanel version={v} onJob={(id, label) => onJob(id, label)} onChange={onChange} />

      {editing ? (
        <ManualEditor
          assetId={asset.id}
          version={v}
          onSaved={() => {
            setEditing(false);
            setMsg({ error: false, text: "Saved as a new version. ContentOS will propose voice rules from your edit in Settings → Voice rules." });
            onChange();
          }}
        />
      ) : (
        <ol className="space-y-3">
          {v.body.sections.map((s) => (
            <SectionCard key={s.key} assetId={asset.id} version={v.version} section={s} previous={parent?.body.sections.find((p) => p.key === s.key)} onJob={onJob} />
          ))}
        </ol>
      )}

      {asset.format === "carousel" && <DesignStudio assetId={asset.id} />}

      <details className="card text-sm">
        <summary className="cursor-pointer font-semibold">Self-check</summary>
        <p className="mt-2">
          <span className="font-medium">Single point:</span> {v.body.single_point}
        </p>
        <p className="mt-1">
          <span className="font-medium">Cover test:</span> {v.body.cover_test}
        </p>
      </details>
    </div>
  );
}

function SectionCard({
  assetId,
  version,
  section: s,
  previous,
  onJob,
}: {
  assetId: string;
  version: number;
  section: DraftSection;
  previous?: DraftSection;
  onJob: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = previous && (previous.text !== s.text || previous.headline !== s.headline);

  async function revise(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ job_id: string }>(`/api/v1/assets/${assetId}/revise`, {
        method: "POST",
        json: { version, section: s.key, instruction },
      });
      onJob(r.job_id);
      setOpen(false);
      setInstruction("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`card space-y-2 ${changed ? "border-[var(--accent)]" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="chip">
          {s.key} · {KIND_LABEL[s.kind]}
          {s.kind === "tweet" || s.kind === "hook" ? ` · ${s.text.length}` : ""}
        </span>
        <button className="btn-ghost" onClick={() => setOpen(!open)}>
          {open ? "Close" : "Revise"}
        </button>
      </div>
      {s.headline && <p className="font-display text-xl">{s.headline}</p>}
      <p className="whitespace-pre-wrap">{s.text}</p>
      {s.on_screen && <p className="text-sm text-muted">On screen: {s.on_screen}</p>}
      {s.broll && <p className="text-sm text-muted">Show: {s.broll}</p>}
      {changed && (
        <details className="text-sm text-muted">
          <summary className="cursor-pointer">Changed — show previous</summary>
          {previous.headline && <p className="mt-1 font-medium">{previous.headline}</p>}
          <p className="mt-1 whitespace-pre-wrap line-through decoration-1">{previous.text}</p>
        </details>
      )}
      {open && (
        <form onSubmit={revise} className="space-y-2">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">What should change?</span>
            <input
              className="input"
              required
              minLength={3}
              maxLength={1000}
              placeholder="e.g. Start from the moment the client calls back"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Starting…" : `Revise ${s.key}`}
          </button>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </form>
      )}
    </li>
  );
}

function ManualEditor({ assetId, version, onSaved }: { assetId: string; version: ContentVersionView; onSaved: () => void }) {
  const [sections, setSections] = useState(version.body.sections.map((s) => ({ ...s })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, field: "text" | "headline" | "on_screen" | "broll", value: string) =>
    setSections(sections.map((s) => (s.key === key ? { ...s, [field]: value } : s)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/assets/${assetId}/versions`, {
        method: "POST",
        json: {
          base_version: version.version,
          sections: sections.map((s) => ({ key: s.key, text: s.text, headline: s.headline, on_screen: s.on_screen, broll: s.broll })),
        },
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {sections.map((s) => (
        <div key={s.key} className="card space-y-2">
          <span className="chip">
            {s.key} · {KIND_LABEL[s.kind]}
          </span>
          {s.headline !== null && (
            <input className="input" aria-label={`${s.key} headline`} value={s.headline ?? ""} onChange={(e) => update(s.key, "headline", e.target.value)} />
          )}
          <textarea className="input" aria-label={`${s.key} text`} rows={Math.max(2, Math.ceil(s.text.length / 80))} value={s.text} onChange={(e) => update(s.key, "text", e.target.value)} />
          {s.on_screen !== null && (
            <input className="input" aria-label={`${s.key} on-screen text`} value={s.on_screen ?? ""} onChange={(e) => update(s.key, "on_screen", e.target.value)} />
          )}
          {s.broll !== null && (
            <input className="input" aria-label={`${s.key} what is shown`} value={s.broll ?? ""} onChange={(e) => update(s.key, "broll", e.target.value)} />
          )}
        </div>
      ))}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? "Saving…" : "Save as new version"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
