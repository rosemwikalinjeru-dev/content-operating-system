"use client";

import { BRAND_DEFAULTS_VERSION, ROSE_NJERU_DEFAULTS, type BrandProfile } from "@contentos/schemas";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

/** Rows needed to show the text, counting long lines as wrapping at ~90 characters (3–14). */
const textRows = (v: string) =>
  Math.min(14, Math.max(3, v.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 90)), 0) + 1));

const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);
const join = (v: string[]) => v.join("\n");

interface FormState {
  name: string;
  positioning: string;
  audiencePrimary: string;
  segments: string;
  pains: string;
  outcomes: string;
  summary: string;
  tone: string;
  principles: string;
  preferred: string;
  banned: string;
  sentenceStyle: string;
  pillars: string;
  colors: string;
  displayFont: string;
  bodyFont: string;
  monoFont: string;
  brandLine: string;
  promise: string;
  messagePillars: string;
  methodology: string;
  messagingStructure: string;
  mixGrowth: string;
  mixAuthority: string;
  mixConversion: string;
  mixPersonal: string;
}

function toForm(b: Pick<BrandProfile, "name" | "positioning" | "audience" | "voice_profile" | "brand_guidelines">): FormState {
  return {
    name: b.name,
    positioning: b.positioning ?? "",
    audiencePrimary: b.audience.primary,
    segments: join(b.audience.segments),
    pains: join(b.audience.pains),
    outcomes: join(b.audience.desired_outcomes),
    summary: b.voice_profile.summary,
    tone: join(b.voice_profile.tone),
    principles: join(b.voice_profile.principles),
    preferred: join(b.voice_profile.preferred_phrases),
    banned: join(b.voice_profile.banned_phrases),
    sentenceStyle: b.voice_profile.sentence_style,
    pillars: join(b.brand_guidelines.content_pillars),
    colors: Object.entries(b.brand_guidelines.colors).map(([k, v]) => `${k}: ${v}`).join("\n"),
    displayFont: b.brand_guidelines.fonts.display ?? "",
    bodyFont: b.brand_guidelines.fonts.body ?? "",
    monoFont: b.brand_guidelines.fonts.mono ?? "",
    brandLine: b.brand_guidelines.messaging.brand_line,
    promise: b.brand_guidelines.messaging.promise,
    messagePillars: join(b.brand_guidelines.messaging.message_pillars),
    methodology: join(b.brand_guidelines.messaging.methodology),
    messagingStructure: join(b.brand_guidelines.messaging.messaging_structure),
    mixGrowth: String(b.brand_guidelines.content_mix.growth),
    mixAuthority: String(b.brand_guidelines.content_mix.authority),
    mixConversion: String(b.brand_guidelines.content_mix.conversion),
    mixPersonal: String(b.brand_guidelines.content_mix.personal),
  };
}

function toPayload(f: FormState) {
  const colors = Object.fromEntries(
    lines(f.colors).map((l) => {
      const [k = "", v = ""] = l.split(":").map((s) => s.trim());
      return [k.toLowerCase().replace(/[^a-z0-9_]/g, "_"), v];
    }),
  );
  return {
    name: f.name,
    positioning: f.positioning.trim() || null,
    audience: {
      primary: f.audiencePrimary,
      segments: lines(f.segments),
      pains: lines(f.pains),
      desired_outcomes: lines(f.outcomes),
    },
    voice_profile: {
      summary: f.summary,
      tone: lines(f.tone),
      principles: lines(f.principles),
      preferred_phrases: lines(f.preferred),
      banned_phrases: lines(f.banned),
      sentence_style: f.sentenceStyle,
    },
    brand_guidelines: {
      colors,
      fonts: { display: f.displayFont || undefined, body: f.bodyFont || undefined, mono: f.monoFont || undefined },
      content_pillars: lines(f.pillars),
      content_mix: {
        growth: Number(f.mixGrowth),
        authority: Number(f.mixAuthority),
        conversion: Number(f.mixConversion),
        personal: Number(f.mixPersonal),
      },
      messaging: {
        brand_line: f.brandLine,
        promise: f.promise,
        message_pillars: lines(f.messagePillars),
        methodology: lines(f.methodology),
        messaging_structure: lines(f.messagingStructure),
      },
    },
  };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-muted">{hint}</span>}
      {children}
    </label>
  );
}

export function BrandEditor({ brand }: { brand: BrandProfile }) {
  const router = useRouter();
  const [form, setForm] = useState(() => toForm(brand));
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; msg?: string }>({ kind: "idle" });
  const unconfigured = !brand.positioning && brand.voice_profile.principles.length === 0;
  const mixTotal = [form.mixGrowth, form.mixAuthority, form.mixConversion, form.mixPersonal].reduce((t, v) => t + (Number(v) || 0), 0);

  function loadDefaults() {
    if (!unconfigured && !window.confirm("Replace everything in this form with the brand defaults? Nothing is saved until you click Save.")) {
      return;
    }
    setForm(toForm({ ...ROSE_NJERU_DEFAULTS, positioning: ROSE_NJERU_DEFAULTS.positioning ?? null }));
    setState({ kind: "idle", msg: "Defaults loaded into the form. Review, then save." });
  }

  const bind = (key: keyof FormState, multiline = false) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: e.target.value }),
    className: "input",
    // Grow with the content so every item is visible during review (3–14 rows).
    ...(multiline ? { rows: textRows(form[key]) } : {}),
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "saving" });
    try {
      await apiFetch(`/api/v1/brands/${brand.id}`, { method: "PATCH", json: toPayload(form) });
      setState({ kind: "saved", msg: "Brand DNA saved." });
      router.refresh();
    } catch (err) {
      setState({ kind: "error", msg: (err as Error).message });
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          Brand Identity &amp; Guidelines v{BRAND_DEFAULTS_VERSION}. Load it into the form, review, then save.
        </p>
        <button type="button" className="btn-ghost whitespace-nowrap" onClick={loadDefaults}>
          Load brand defaults
        </button>
      </div>

      <fieldset className="card space-y-4">
        <legend className="font-display px-1 text-2xl">Identity</legend>
        <Field label="Brand name"><input required maxLength={120} {...bind("name")} /></Field>
        <Field label="Positioning"><textarea maxLength={2000} {...bind("positioning", true)} /></Field>
      </fieldset>

      <fieldset className="card space-y-4">
        <legend className="font-display px-1 text-2xl">Messaging</legend>
        <Field label="Brand line"><input maxLength={300} {...bind("brandLine")} /></Field>
        <Field label="Brand promise"><input maxLength={300} {...bind("promise")} /></Field>
        <Field label="Message pillars" hint="One per line as pillar: message"><textarea {...bind("messagePillars", true)} /></Field>
        <Field label="Methodology" hint="Stages in order, one per line as stage: description"><textarea {...bind("methodology", true)} /></Field>
        <Field label="Messaging structure" hint="The steps every piece follows, in order"><textarea {...bind("messagingStructure", true)} /></Field>
      </fieldset>

      <fieldset className="card space-y-4">
        <legend className="font-display px-1 text-2xl">Content mix</legend>
        <p className="text-sm text-muted">
          Target share of posts by type. The brief writer uses your recent approved briefs to keep the mix on target.
        </p>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Growth %" hint="Get discovered"><input type="number" min={0} max={100} required {...bind("mixGrowth")} /></Field>
          <Field label="Authority %" hint="Build trust"><input type="number" min={0} max={100} required {...bind("mixAuthority")} /></Field>
          <Field label="Conversion %" hint="Win clients"><input type="number" min={0} max={100} required {...bind("mixConversion")} /></Field>
          <Field label="Personal %" hint="Be remembered"><input type="number" min={0} max={100} required {...bind("mixPersonal")} /></Field>
        </div>
        <p className={`metric text-sm ${mixTotal === 100 ? "text-muted" : "text-red-600"}`} role="status">
          Total: {mixTotal}%{mixTotal === 100 ? "" : " (must be 100%)"}
        </p>
      </fieldset>

      <fieldset className="card space-y-4">
        <legend className="font-display px-1 text-2xl">Audience</legend>
        <Field label="Primary audience"><input {...bind("audiencePrimary")} /></Field>
        <Field label="Segments" hint="One per line"><textarea {...bind("segments", true)} /></Field>
        <Field label="Pains" hint="One per line"><textarea {...bind("pains", true)} /></Field>
        <Field label="Desired outcomes" hint="One per line"><textarea {...bind("outcomes", true)} /></Field>
      </fieldset>

      <fieldset className="card space-y-4">
        <legend className="font-display px-1 text-2xl">Voice</legend>
        <Field label="Voice summary"><textarea {...bind("summary", true)} /></Field>
        <Field label="Tone" hint="One per line"><textarea {...bind("tone", true)} /></Field>
        <Field label="Principles" hint="Rules every piece must follow. One per line."><textarea {...bind("principles", true)} /></Field>
        <Field label="Preferred phrases" hint="One per line"><textarea {...bind("preferred", true)} /></Field>
        <Field label="Banned phrases" hint="The editorial engine flags these. One per line."><textarea {...bind("banned", true)} /></Field>
        <Field label="Sentence style"><textarea {...bind("sentenceStyle", true)} /></Field>
      </fieldset>

      <fieldset className="card space-y-4">
        <legend className="font-display px-1 text-2xl">Visual guidelines and pillars</legend>
        <Field label="Content pillars" hint="One per line"><textarea {...bind("pillars", true)} /></Field>
        <Field label="Colours" hint="One per line as name: #RRGGBB"><textarea {...bind("colors", true)} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Editorial font"><input {...bind("displayFont")} /></Field>
          <Field label="Body font"><input {...bind("bodyFont")} /></Field>
          <Field label="Mono font (metrics)"><input {...bind("monoFont")} /></Field>
        </div>
      </fieldset>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
        <button type="submit" className="btn-primary" disabled={state.kind === "saving" || mixTotal !== 100}>
          {state.kind === "saving" ? "Saving…" : "Save Brand DNA"}
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
