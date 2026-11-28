/**
 * The "do not repeat" list: openings, endings and recurring phrases a new piece must not reuse.
 * No dependency on the agent prompts (avoids a circular import).
 */
import type { DraftBody } from "@contentos/schemas";
import { asData } from "./prompts";

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// "Do not repeat" list for writers
// ---------------------------------------------------------------------------

export interface AvoidList {
  openers: string[];
  closers: string[];
  phrases: string[];
  /** What the niche is already saying (from collected research posts). */
  niche?: NicheTakes;
}

export interface NicheTakes {
  topics: string[];
  phrases: string[];
}

/**
 * The niche's common takes: problem topics that recur across collected posts, and 5+ word
 * phrases used in three or more different posts. New content must find its own angle.
 */
export function buildNicheTakes(posts: Array<{ text: string; topic: string | null }>, limits = { topics: 10, phrases: 12 }): NicheTakes {
  const counts = new Map<string, number>();
  for (const p of posts) {
    const t = p.topic?.trim().toLowerCase();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const topics = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, limits.topics).map(([t]) => t);
  const seen = new Map<string, Set<number>>();
  posts.forEach((p, i) => {
    const words = normalise(p.text).split(" ").filter(Boolean);
    for (let k = 0; k + 5 <= words.length; k++) {
      const g = words.slice(k, k + 5).join(" ");
      if (!seen.has(g)) seen.set(g, new Set());
      seen.get(g)!.add(i);
    }
  });
  const phrases: string[] = [];
  for (const [g, s] of [...seen.entries()].sort((a, b) => b[1].size - a[1].size)) {
    if (s.size < 3) break;
    if (phrases.some((p) => p.includes(g.split(" ").slice(1, 4).join(" ")))) continue;
    phrases.push(g);
    if (phrases.length >= limits.phrases) break;
  }
  return { topics, phrases };
}

function firstSentence(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const m = line.match(/^.{12,}?[.!?](?=\s|$)/);
  return (m ? m[0] : line).slice(0, 160);
}

/**
 * What a new piece must not reuse: openings and endings of recent pieces and the owner's posts,
 * plus 5+ word phrases that already recur across two or more of them (verbal tics).
 */
export function buildAvoidList(pieces: Array<{ opener: string; closer: string; text: string }>, limits = { openers: 15, closers: 10, phrases: 15 }): AvoidList {
  const uniq = (xs: string[]) => [...new Map(xs.filter((x) => x.length >= 12).map((x) => [normalise(x), x])).values()];
  const openers = uniq(pieces.map((p) => firstSentence(p.opener))).slice(0, limits.openers);
  const closers = uniq(pieces.map((p) => firstSentence(p.closer))).slice(0, limits.closers);

  const N = 5;
  const seenIn = new Map<string, Set<number>>();
  pieces.forEach((p, i) => {
    const words = normalise(p.text).split(" ").filter(Boolean);
    for (let k = 0; k + N <= words.length; k++) {
      const g = words.slice(k, k + N).join(" ");
      if (!seenIn.has(g)) seenIn.set(g, new Set());
      seenIn.get(g)!.add(i);
    }
  });
  const recurring = [...seenIn.entries()].filter(([, s]) => s.size >= 2).map(([g]) => g);
  // Drop phrases fully contained in a longer kept one (overlapping grams of the same tic).
  const phrases: string[] = [];
  for (const g of recurring) {
    if (phrases.some((p) => p.includes(g.split(" ").slice(1, 4).join(" ")))) continue;
    phrases.push(g);
    if (phrases.length >= limits.phrases) break;
  }
  return { openers, closers, phrases };
}

export function renderNicheTakes(niche: NicheTakes | null | undefined): string {
  if (!niche || (!niche.topics.length && !niche.phrases.length)) return "";
  const block = (title: string, xs: string[]) => (xs.length ? `${title}:\n${xs.map((x) => `- ${x}`).join("\n")}` : "");
  return asData(
    "what_everyone_is_saying",
    [
      "What creators in the owner's niche are already posting (from collected public posts). Do not make the same point in the same way. If the topic overlaps, find the angle they are missing: the hidden cause, the operational detail, the measurement, the thing that breaks. Never reuse their phrases.",
      block("Common topics", niche.topics),
      block("Phrases everyone uses", niche.phrases),
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
}

export function renderAvoidList(avoid: AvoidList | null | undefined): string {
  const niche = renderNicheTakes(avoid?.niche);
  if (!avoid || (!avoid.openers.length && !avoid.closers.length && !avoid.phrases.length)) return niche;
  const block = (title: string, xs: string[]) => (xs.length ? `${title}:\n${xs.map((x) => `- ${x}`).join("\n")}` : "");
  return asData(
    "do_not_repeat",
    [
      "Already used in the owner's posts or recent drafts. Do not reuse these openings, endings or phrases, or close paraphrases of them.",
      block("Openings", avoid.openers),
      block("Endings", avoid.closers),
      block("Recurring phrases", avoid.phrases),
    ]
      .filter(Boolean)
      .join("\n\n"),
  ) + (niche ? `\n\n${niche}` : "");
}

/** Opener / closer / full text of a stored draft body or a plain post. */
export function pieceFromBody(body: Pick<DraftBody, "sections">): { opener: string; closer: string; text: string } {
  const first = body.sections[0];
  const last = body.sections[body.sections.length - 1];
  return {
    opener: first ? first.headline ?? first.text : "",
    closer: last && body.sections.length > 1 ? last.text : "",
    text: body.sections.map((s) => [s.headline, s.text].filter(Boolean).join(" ")).join("\n"),
  };
}

export function pieceFromPost(text: string): { opener: string; closer: string; text: string } {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return { opener: paras[0] ?? "", closer: paras.length > 1 ? paras[paras.length - 1]! : "", text };
}
