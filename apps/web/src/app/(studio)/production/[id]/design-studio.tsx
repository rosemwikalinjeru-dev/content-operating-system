"use client";

import {
  ASPECT_LABELS,
  CAROUSEL_ASPECTS,
  CAROUSEL_TEMPLATES,
  SLIDE_LAYOUTS,
  TEMPLATE_LABELS,
  type CarouselAspect,
  type CarouselDesignView,
  type CarouselTemplate,
  type DesignSlide,
  type ReadabilityIssue,
  type SlideLayout,
} from "@contentos/schemas";
import { planCarousel, slideDuration } from "@contentos/visual";
import { useCallback, useEffect, useState } from "react";
import { JobProgress } from "@/components/job-progress";
import { apiFetch } from "@/lib/api-client";

type Design = CarouselDesignView & { issues: ReadabilityIssue[]; issues_square: ReadabilityIssue[] };
type Editable = Omit<DesignSlide, "id"> & { key: string };
type BrandLite = Parameters<typeof planCarousel>[1]["brand"];

const LAYOUT_LABEL: Record<SlideLayout, string> = {
  cover: "Cover",
  statement: "Statement",
  list: "List",
  before_after: "Before / After",
  diagram: "Diagram",
  screenshot: "Screenshot",
  closing: "Closing",
};

export function DesignStudio({ assetId }: { assetId: string }) {
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [brand, setBrand] = useState<BrandLite | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [job, setJob] = useState<{ id: string; label: string } | null>(null);
  const [template, setTemplate] = useState<CarouselTemplate | "auto">("auto");
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: Design[]; brand: BrandLite }>(`/api/v1/assets/${assetId}/designs`);
      setDesigns(res.data);
      setBrand(res.brand);
      setSelected((s) => (s && res.data.some((d) => d.version === s) ? s : (res.data[0]?.version ?? null)));
    } catch (err) {
      setMsg({ error: true, text: (err as Error).message });
    }
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function design() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiFetch<{ job_id: string }>(`/api/v1/assets/${assetId}/design`, {
        method: "POST",
        json: template === "auto" ? {} : { template },
      });
      setJob({ id: r.job_id, label: "Designing the carousel" });
    } catch (err) {
      setMsg({ error: true, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const current = designs?.find((d) => d.version === selected) ?? designs?.[0];

  return (
    <section className="card space-y-4" aria-labelledby="design-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 id="design-heading" className="font-display text-2xl">
            Carousel design
          </h3>
          <p className="text-sm text-muted">Slides in your brand, from the approved narrative (or the latest version if none is approved).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto" value={template} onChange={(e) => setTemplate(e.target.value as CarouselTemplate | "auto")} aria-label="Template">
            <option value="auto">Template: let ContentOS choose</option>
            {CAROUSEL_TEMPLATES.map((t) => (
              <option key={t} value={t}>
                {TEMPLATE_LABELS[t]}
              </option>
            ))}
          </select>
          <button className="btn-primary" onClick={design} disabled={busy}>
            {designs?.length ? "Design again" : "Design carousel"}
          </button>
        </div>
      </div>
      {msg && (
        <p role={msg.error ? "alert" : "status"} className={`text-sm ${msg.error ? "text-red-600" : "text-muted"}`}>
          {msg.text}
        </p>
      )}
      {job && <JobProgress key={job.id} jobId={job.id} label={job.label} onDone={() => void load()} />}
      {designs === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !current ? (
        <p className="text-sm text-muted">No design yet.</p>
      ) : (
        <DesignPanel
          key={current.id}
          design={current}
          versions={designs.map((d) => d.version)}
          onSelect={setSelected}
          onSaved={async () => {
            setSelected(null);
            await load();
          }}
          onJob={(id, label) => setJob({ id, label })}
          assetId={assetId}
          brand={brand}
        />
      )}
    </section>
  );
}

function toEditable(slides: DesignSlide[]): Editable[] {
  return slides.map(({ id, ...rest }) => ({ ...rest, key: id }));
}

function DesignPanel({
  design,
  versions,
  onSelect,
  onSaved,
  onJob,
  assetId,
  brand,
}: {
  brand: BrandLite | null;
  design: Design;
  versions: number[];
  onSelect: (v: number) => void;
  onSaved: () => Promise<void>;
  onJob: (id: string, label: string) => void;
  assetId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Editable[]>(toEditable(design.slides));
  const [tmpl, setTmpl] = useState<CarouselTemplate>(design.template);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [exportReason, setExportReason] = useState("");
  const [aspect, setAspect] = useState<CarouselAspect>("4:5");
  const [exportAspects, setExportAspects] = useState<CarouselAspect[]>(["4:5", "1:1"]);
  const issuesOf = (a: CarouselAspect) => (a === "4:5" ? design.issues : design.issues_square);
  const shownIssues = issuesOf(aspect);
  const exportIssues = exportAspects.flatMap(issuesOf);
  const [files, setFiles] = useState<Array<{ file: string; url: string }>>([]);

  async function act(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    setMsg(null);
    try {
      const t = await fn();
      if (t) setMsg({ error: false, text: t });
    } catch (err) {
      setMsg({ error: true, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    act("save", async () => {
      await apiFetch(`/api/v1/assets/${assetId}/designs`, {
        method: "POST",
        json: { base_version: design.version, template: tmpl, slides: draft.map(({ key: _key, ...s }) => s) },
      });
      setEditing(false);
      await onSaved();
      return "Saved as a new version.";
    });

  const doExport = () =>
    act("export", async () => {
      const r = await apiFetch<{ files: Array<{ file: string; url: string }>; overridden: boolean }>(`/api/v1/designs/${design.id}/export`, {
        method: "POST",
        json: { aspects: exportAspects, ...(exportIssues.length ? { override_reason: exportReason } : {}) },
      });
      setFiles(r.files);
      return r.overridden ? "Exported with your recorded reason." : "Exported. Links work for 10 minutes.";
    });

  const update = (i: number, patch: Partial<Editable>) => setDraft(draft.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setDraft(next);
  };
  const issuesFor = (slide: string) => shownIssues.filter((x) => x.slide === slide);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto" value={design.version} onChange={(e) => onSelect(Number(e.target.value))} aria-label="Design version">
            {versions.map((v) => (
              <option key={v} value={v}>
                Design v{v}
              </option>
            ))}
          </select>
          <span className="chip">{TEMPLATE_LABELS[design.template]}</span>
          <select className="input w-auto" value={aspect} onChange={(e) => setAspect(e.target.value as CarouselAspect)} aria-label="Preview size">
            {CAROUSEL_ASPECTS.map((a) => (
              <option key={a} value={a}>
                Preview {a}
              </option>
            ))}
          </select>
          <span className={`chip ${shownIssues.length ? "border-red-600 text-red-600" : ""}`}>
            {shownIssues.length ? `${shownIssues.length} readability issue${shownIssues.length === 1 ? "" : "s"} at ${aspect}` : `Readability at ${aspect}: all slides pass`}
          </span>
          {design.change_note && <span className="text-xs text-muted">{design.change_note}</span>}
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setEditing(!editing)} disabled={busy !== null}>
            {editing ? "Cancel edit" : "Edit slides"}
          </button>
          {editing && (
            <button className="btn-primary" onClick={save} disabled={busy !== null}>
              Save as new version
            </button>
          )}
        </div>
      </div>

      {editing && (
        <label className="block text-sm">
          <span className="font-medium">Template</span>
          <select className="input mt-1" value={tmpl} onChange={(e) => setTmpl(e.target.value as CarouselTemplate)}>
            {CAROUSEL_TEMPLATES.map((t) => (
              <option key={t} value={t}>
                {TEMPLATE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      )}

      {msg && (
        <p role={msg.error ? "alert" : "status"} className={`text-sm ${msg.error ? "text-red-600" : "text-muted"}`}>
          {msg.text}
        </p>
      )}

      <ol className="grid gap-4 sm:grid-cols-2">
        {(editing ? draft : toEditable(design.slides)).map((s, i) => (
          <li key={`${s.key}-${i}`} className="space-y-2">
            {!editing && (
              // Preview images are rendered server-side from the saved (immutable) design.
              <img
                src={`/api/v1/designs/${design.id}/slides/${s.key}?aspect=${encodeURIComponent(aspect)}`}
                alt={`Slide ${i + 1}: ${s.headline}`}
                className="w-full rounded border border-[var(--border)]"
                loading="lazy"
              />
            )}
            {!editing &&
              issuesFor(s.key).map((x, n) => (
                <p key={n} className="text-xs text-red-600">
                  ⚠ {x.message}
                </p>
              ))}
            {editing ? (
              <SlideEditor
                slide={s}
                index={i}
                count={draft.length}
                onChange={(p) => update(i, p)}
                onMove={(d) => move(i, d)}
                onRemove={() => setDraft(draft.filter((_, j) => j !== i))}
                onAdd={() => {
                  const next = [...draft];
                  next.splice(i + 1, 0, { key: `new${Date.now()}`, layout: "statement", kicker: null, headline: "New slide", body: null, items: [], before: null, after: null, emphasis: [], visual: { type: "none" } });
                  setDraft(next);
                }}
              />
            ) : (
              <SlideActions designId={design.id} slide={s} onJob={onJob} onUploaded={onSaved} />
            )}
          </li>
        ))}
      </ol>

      {!editing && brand && <VideoExport design={design} brand={brand} />}

      {!editing && (
        <div className="space-y-2 border-t border-[var(--border)] pt-4">
          <p className="font-semibold">Export</p>
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="sr-only">Sizes</legend>
            {CAROUSEL_ASPECTS.map((a) => (
              <label key={a} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={exportAspects.includes(a)}
                  onChange={(e) => setExportAspects(e.target.checked ? [...exportAspects, a] : exportAspects.filter((x) => x !== a))}
                />
                {ASPECT_LABELS[a]}
              </label>
            ))}
          </fieldset>
          {exportIssues.length > 0 && (
            <input
              className="input"
              placeholder="Readability checks fail. To export anyway, say why (recorded with the export)."
              value={exportReason}
              onChange={(e) => setExportReason(e.target.value)}
            />
          )}
          <button
            className="btn-primary"
            onClick={doExport}
            disabled={busy !== null || exportAspects.length === 0 || (exportIssues.length > 0 && exportReason.trim().length < 5)}
          >
            {busy === "export" ? "Rendering…" : "Export PNG, PDF and ZIP"}
          </button>
          {files.length > 0 && (
            <ul className="space-y-1 text-sm">
              {files.map((f) => (
                <li key={f.url}>
                  <a className="underline" href={f.url}>
                    {f.file}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SlideActions({
  designId,
  slide,
  onJob,
  onUploaded,
}: {
  designId: string;
  slide: Editable;
  onJob: (id: string, label: string) => void;
  onUploaded: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function revise(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ job_id: string }>(`/api/v1/designs/${designId}/revise-slide`, { method: "POST", json: { slide: slide.key, instruction } });
      onJob(r.job_id, `Revising ${slide.key}`);
      setOpen(false);
      setInstruction("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!window.confirm("Is this screenshot yours to publish, with no client data visible?")) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("slide", slide.key);
      form.set("rights", "yes");
      form.set("file", file);
      await apiFetch(`/api/v1/designs/${designId}/screenshot`, { method: "POST", body: form });
      await onUploaded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" onClick={() => setOpen(!open)}>
          {open ? "Close" : `Revise ${slide.key}`}
        </button>
        {slide.layout === "screenshot" && (
          <label className="btn-ghost cursor-pointer">
            {busy ? "Uploading…" : "Upload screenshot"}
            <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
        )}
      </div>
      {open && (
        <form onSubmit={revise} className="space-y-2">
          <input
            className="input"
            required
            minLength={3}
            maxLength={1000}
            placeholder="e.g. Make this a diagram of the handoff"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={busy}>
            Revise
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function SlideEditor({
  slide: s,
  index,
  count,
  onChange,
  onMove,
  onRemove,
  onAdd,
}: {
  slide: Editable;
  index: number;
  count: number;
  onChange: (p: Partial<Editable>) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  onAdd: () => void;
}) {
  const field = (label: string, value: string | null, set: (v: string | null) => void, rows = 1) => (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {rows > 1 ? (
        <textarea className="input" rows={rows} value={value ?? ""} onChange={(e) => set(e.target.value || null)} />
      ) : (
        <input className="input" value={value ?? ""} onChange={(e) => set(e.target.value || null)} />
      )}
    </label>
  );
  return (
    <div className="space-y-2 rounded border border-[var(--border)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip">Slide {index + 1}</span>
        <select className="input w-auto" value={s.layout} onChange={(e) => onChange({ layout: e.target.value as SlideLayout })} aria-label="Layout">
          {SLIDE_LAYOUTS.map((l) => (
            <option key={l} value={l}>
              {LAYOUT_LABEL[l]}
            </option>
          ))}
        </select>
        <button className="btn-ghost" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">
          ↑
        </button>
        <button className="btn-ghost" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move down">
          ↓
        </button>
        <button className="btn-ghost" onClick={onAdd} disabled={count >= 12}>
          + Add after
        </button>
        <button className="btn-ghost" onClick={onRemove} disabled={count <= 3}>
          Remove
        </button>
      </div>
      {field("Label above headline", s.kicker, (v) => onChange({ kicker: v }))}
      {field("Headline", s.headline, (v) => onChange({ headline: v ?? "" }), 2)}
      {field("Highlighted words (comma-separated)", s.emphasis.join(", ") || null, (v) => onChange({ emphasis: (v ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 3) }))}
      {s.layout === "list" && field("Items (one per line)", s.items.join("\n") || null, (v) => onChange({ items: (v ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 5) }), 4)}
      {s.layout === "before_after" && (
        <>
          {field("Before", s.before, (v) => onChange({ before: v }), 2)}
          {field("After", s.after, (v) => onChange({ after: v }), 2)}
        </>
      )}
      {s.layout === "diagram" &&
        field(
          "Diagram steps (one per line, top to bottom)",
          s.visual.type === "diagram" ? s.visual.diagram.nodes.map((n) => n.label).join("\n") : null,
          (v) => {
            const labels = (v ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 6);
            const nodes = labels.map((label, i) => ({ id: `n${i + 1}`, label: label.slice(0, 40) }));
            onChange({ visual: labels.length >= 2 ? { type: "diagram", diagram: { nodes, edges: nodes.slice(1).map((n, i) => ({ from: nodes[i]!.id, to: n.id, label: null })) } } : { type: "none" } });
          },
          4,
        )}
      {field("Supporting line", s.body, (v) => onChange({ body: v }), 2)}
    </div>
  );
}

/** Motion graphics: the browser animates the slides and builds an MP4 (nothing is uploaded). */
function VideoExport({ design, brand }: { design: Design; brand: BrandLite }) {
  const [aspect, setAspect] = useState<CarouselAspect>("4:5");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const issues = aspect === "4:5" ? design.issues : design.issues_square;
  const plans = planCarousel(design.slides, { template: design.template, brand, aspect });
  const seconds = Math.round(plans.reduce((t, p) => t + slideDuration(p), 0));

  async function make() {
    setError(null);
    setFile(null);
    setProgress(0);
    try {
      const { encodeCarousel, loadImages, videoSupported } = await import("@/motion/encode");
      if (!videoSupported()) throw new Error("This browser cannot make MP4 video. Use Chrome, Edge or Safari on a computer.");
      const mediaIds = [...new Set(plans.flatMap((p) => p.elements.flatMap((e) => (e.kind === "image" ? [e.mediaId] : []))))];
      const images = await loadImages(Object.fromEntries(mediaIds.map((id) => [id, `/api/v1/media/${id}`])));
      const blob = await encodeCarousel(plans, { images, onProgress: (d, t) => setProgress(Math.round((d / t) * 100)) });
      const name = `carousel-v${design.version}-${aspect === "4:5" ? "4x5" : "1x1"}.mp4`;
      setFile({ url: URL.createObjectURL(blob), name });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="space-y-2 border-t border-[var(--border)] pt-4">
      <p className="font-semibold">Motion graphics (MP4)</p>
      <p className="text-sm text-muted">
        Calm animation: text eases in, highlighted words light up, diagrams build step by step. About {seconds} seconds. Made in this
        browser, so keep the tab open until it finishes.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={aspect} onChange={(e) => setAspect(e.target.value as CarouselAspect)} aria-label="Video size">
          {CAROUSEL_ASPECTS.map((a) => (
            <option key={a} value={a}>
              {ASPECT_LABELS[a]}
            </option>
          ))}
        </select>
        <button className="btn-primary" onClick={make} disabled={progress !== null}>
          {progress !== null ? `Making video… ${progress}%` : "Export video"}
        </button>
      </div>
      {issues.length > 0 && <p className="text-xs text-red-600">⚠ {issues.length} readability issue(s) at this size; the video shows the slides as they are.</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {file && (
        <div className="space-y-2">
          <video src={file.url} controls muted playsInline className="w-full max-w-sm rounded border border-[var(--border)]" />
          <a className="btn-ghost inline-block" href={file.url} download={file.name}>
            Download {file.name}
          </a>
        </div>
      )}
    </div>
  );
}
