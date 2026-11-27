/**
 * Phase 3 — multi-format writing. One body shape for every format: an ordered list of keyed
 * sections, so revision and editing work the same way everywhere. Pure (safe in the browser).
 */
import { z } from "zod";
import type { ReviewView } from "./editorial";
import { ContentFormat } from "./intelligence";

export const SECTION_KINDS = ["hook", "paragraph", "closing", "tweet", "slide", "beat", "cta"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

/** What the format writer returns (keys are assigned by code, not the model). */
export const DraftOutput = z.object({
  sections: z
    .array(
      z.object({
        kind: z.enum(SECTION_KINDS),
        text: z.string().describe("The words: post paragraph, tweet, slide body or spoken line."),
        headline: z.string().nullable().describe("Carousel slides only: the large slide headline. Otherwise null."),
        on_screen: z.string().nullable().describe("Video beats only: on-screen text. Otherwise null."),
        broll: z.string().nullable().describe("Video beats only: what is shown (B-roll or screen recording). Otherwise null."),
      }),
    )
    .min(1),
  single_point: z.string().describe("The one point this piece makes."),
  cover_test: z.string().describe("What makes this unmistakably the owner's, with her name hidden."),
});
export type DraftOutput = z.infer<typeof DraftOutput>;

/** What the section reviser returns. */
export const SectionRevisionOutput = z.object({
  text: z.string(),
  headline: z.string().nullable(),
  on_screen: z.string().nullable(),
  broll: z.string().nullable(),
  note: z.string().describe("One sentence: what changed and why."),
});
export type SectionRevisionOutput = z.infer<typeof SectionRevisionOutput>;

export const DraftSection = z.object({
  key: z.string().regex(/^s\d{1,2}$/),
  kind: z.enum(SECTION_KINDS),
  text: z.string().max(5000),
  headline: z.string().max(300).nullable().default(null),
  on_screen: z.string().max(300).nullable().default(null),
  broll: z.string().max(500).nullable().default(null),
});
export type DraftSection = z.infer<typeof DraftSection>;

export interface DraftCheck {
  level: "warning";
  section: string | null;
  message: string;
}

export interface DraftBody {
  format: ContentFormat;
  sections: DraftSection[];
  single_point: string;
  cover_test: string;
  /** Owner-only details still to fill, e.g. "[number of missed calls]". */
  placeholders: string[];
  checks: DraftCheck[];
  /** Human edits: what changed against the parent version. */
  edits?: Array<{ key: string; before: string; after: string }>;
}

export const FORMAT_ASSET: Record<ContentFormat, { platform: string; format: string; label: string }> = {
  linkedin: { platform: "linkedin", format: "post", label: "LinkedIn post" },
  x_thread: { platform: "x", format: "thread", label: "X thread" },
  carousel: { platform: "linkedin", format: "carousel", label: "Carousel narrative" },
  short_video: { platform: "generic", format: "short_video", label: "Short-video script" },
};

export function formatFromAsset(platform: string, format: string): ContentFormat | null {
  const hit = (Object.entries(FORMAT_ASSET) as Array<[ContentFormat, { platform: string; format: string }]>).find(
    ([, a]) => a.platform === platform && a.format === format,
  );
  return hit?.[0] ?? null;
}

const PLACEHOLDER = /\[[^\]\n]{2,80}\]/g;

function sectionText(s: DraftSection): string {
  return [s.headline, s.text, s.on_screen, s.broll].filter(Boolean).join(" ");
}

export function findPlaceholders(sections: DraftSection[]): string[] {
  return [...new Set(sections.flatMap((s) => sectionText(s).match(PLACEHOLDER) ?? []))];
}

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** Words no one says out loud; they mark a post as AI-written (The Inbound Blueprint, ch. 9). */
export const AI_JARGON = ["leverage", "synergy", "streamline", "optimise", "optimize", "level up", "unlock", "game-changer", "seamless", "fast-paced", "delve"] as const;
/** Formula endings that signal marketing rather than conversation (ch. 5). */
export const FORMULA_ENDINGS = ["comment below", "what do you think", "thoughts?", "agree?", "dm me"] as const;

/** Platform limits and AI-content traps, reported as warnings (the owner decides; nothing is silently cut). */
export function checkDraft(format: ContentFormat, sections: DraftSection[]): DraftCheck[] {
  const out: DraftCheck[] = [];
  const warn = (message: string, section: string | null = null) => out.push({ level: "warning", section, message });
  for (const s of sections) {
    const t = ` ${[s.headline, s.text, s.on_screen].filter(Boolean).join(" ").toLowerCase()} `;
    const hits = AI_JARGON.filter((j) => new RegExp(`[^a-z]${j.replace("-", "[- ]?")}(s|d|ing|ed)?[^a-z]`).test(t));
    if (hits.length) warn(`Jargon no one says out loud: ${hits.join(", ")}. Use the reader's words.`, s.key);
  }
  const last = sections[sections.length - 1];
  if (last) {
    const t = last.text.toLowerCase();
    const formula = FORMULA_ENDINGS.find((f) => t.includes(f));
    if (formula) warn(`Formula ending ("${formula}"). End on an observation, a specific question, one action, or nothing.`, last.key);
  }
  if (format === "linkedin") {
    const total = sections.map((s) => s.text).join("\n\n").length;
    if (total > 1300) warn(`${total} characters; aim for 1,300 or fewer.`);
    if (sections[0]?.kind !== "hook") warn("The post should open with a hook section.");
  }
  if (format === "x_thread") {
    const tweets = sections.filter((s) => s.kind === "tweet" || s.kind === "hook");
    if (tweets.length < 5 || tweets.length > 10) warn(`${tweets.length} tweets; aim for 5–10.`);
    for (const t of sections) if (t.text.length > 280) warn(`${t.text.length} characters; a tweet allows 280.`, t.key);
  }
  if (format === "carousel") {
    const slides = sections.filter((s) => s.kind === "slide" || s.kind === "hook" || s.kind === "cta");
    if (slides.length < 6 || slides.length > 10) warn(`${slides.length} slides; aim for 6–10.`);
    for (const s of sections) {
      const n = words(`${s.headline ?? ""} ${s.text}`);
      if (n > 25) warn(`${n} words; keep a slide under about 25.`, s.key);
    }
  }
  if (format === "short_video") {
    const spoken = words(sections.map((s) => s.text).join(" "));
    // About 150 spoken words per minute.
    if (spoken > 150) warn(`${spoken} spoken words (about ${Math.round(spoken / 2.5)}s); aim for under 60 seconds.`);
    const hook = sections[0];
    if (hook && words(hook.text) > 12) warn("The spoken hook should land in about 3 seconds (12 words or fewer).", hook.key);
  }
  return out;
}

/** Turn model output into a stored body: keys, placeholders and checks are computed by code. */
export function toDraftBody(format: ContentFormat, out: Pick<DraftOutput, "sections" | "single_point" | "cover_test">): DraftBody {
  const sections = out.sections.map((s, i) =>
    DraftSection.parse({
      key: `s${i + 1}`,
      kind: s.kind,
      text: s.text.trim(),
      headline: s.headline?.trim() || null,
      on_screen: s.on_screen?.trim() || null,
      broll: s.broll?.trim() || null,
    }),
  );
  return {
    format,
    sections,
    single_point: out.single_point,
    cover_test: out.cover_test,
    placeholders: findPlaceholders(sections),
    checks: checkDraft(format, sections),
  };
}

/** Rebuild derived fields after a section changes. */
export function refreshBody(body: DraftBody, sections: DraftSection[], edits?: DraftBody["edits"]): DraftBody {
  const next: DraftBody = { ...body, sections, placeholders: findPlaceholders(sections), checks: checkDraft(body.format, sections) };
  if (edits) next.edits = edits;
  else delete next.edits;
  return next;
}

/** Plain text ready to paste (LinkedIn / X) or a readable script (carousel / video). */
export function toMarkdown(body: Pick<DraftBody, "format" | "sections">): string {
  switch (body.format) {
    case "linkedin":
      return body.sections.map((s) => s.text).join("\n\n");
    case "x_thread":
      return body.sections.map((s, i) => `${i + 1}/${body.sections.length}\n${s.text}`).join("\n\n---\n\n");
    case "carousel":
      return body.sections
        .map((s, i) => `## Slide ${i + 1}${s.headline ? `: ${s.headline}` : ""}\n\n${s.text}`)
        .join("\n\n");
    case "short_video":
      return body.sections
        .map(
          (s, i) =>
            `**${i + 1}. ${s.kind === "hook" ? "Hook" : s.kind === "cta" ? "Close" : "Beat"}**\n\nSay: ${s.text}` +
            (s.on_screen ? `\n\nOn screen: ${s.on_screen}` : "") +
            (s.broll ? `\n\nShow: ${s.broll}` : ""),
        )
        .join("\n\n");
  }
}

// ---------------------------------------------------------------------------
// API inputs and views
// ---------------------------------------------------------------------------

export const WriteRequest = z.object({
  formats: z.array(ContentFormat).min(1).max(4).optional(),
  /** Write again even when nothing changed (new AI version). */
  force: z.boolean().default(false),
});

export const ReviseRequest = z.object({
  version: z.number().int().positive(),
  section: z.string().regex(/^s\d{1,2}$/),
  instruction: z.string().trim().min(3).max(1000),
});

export const ManualEditRequest = z.object({
  base_version: z.number().int().positive(),
  sections: z
    .array(
      z.object({
        key: z.string().regex(/^s\d{1,2}$/),
        text: z.string().max(5000),
        headline: z.string().max(300).nullable().optional(),
        on_screen: z.string().max(300).nullable().optional(),
        broll: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(40),
  note: z.string().trim().max(300).optional(),
});

export interface ContentVersionView {
  id: string;
  version: number;
  status: "draft" | "approved" | "rejected" | "superseded";
  created_by: "ai" | "human";
  model: string | null;
  change_note: string | null;
  revised_section: string | null;
  parent_version: number | null;
  body: DraftBody;
  created_at: string;
  /** Latest editorial review of this version (Phase 4), if any. */
  review?: ReviewView | null;
}

export interface ContentAssetView {
  id: string;
  format: ContentFormat;
  label: string;
  status: string;
  current_version: number;
  approved_version: number | null;
  versions: ContentVersionView[];
}

/**
 * Apply the owner's edits to a version. Only known section keys change; derived fields are
 * rebuilt and the before/after of each changed field is kept (for learned rules in Phase 4).
 */
export function applyManualEdit(
  body: DraftBody,
  patch: Array<{ key: string; text: string; headline?: string | null; on_screen?: string | null; broll?: string | null }>,
): { body: DraftBody; changed: number } {
  const byKey = new Map(patch.map((p) => [p.key, p]));
  const edits: NonNullable<DraftBody["edits"]> = [];
  const sections = body.sections.map((s) => {
    const p = byKey.get(s.key);
    if (!p) return s;
    const next = {
      ...s,
      text: p.text.trim(),
      headline: p.headline === undefined ? s.headline : p.headline?.trim() || null,
      on_screen: p.on_screen === undefined ? s.on_screen : p.on_screen?.trim() || null,
      broll: p.broll === undefined ? s.broll : p.broll?.trim() || null,
    };
    for (const field of ["text", "headline", "on_screen", "broll"] as const) {
      if ((s[field] ?? "") !== (next[field] ?? "")) {
        edits.push({ key: field === "text" ? s.key : `${s.key}.${field}`, before: s[field] ?? "", after: next[field] ?? "" });
      }
    }
    return next;
  });
  return { body: refreshBody(body, sections, edits), changed: edits.length };
}
