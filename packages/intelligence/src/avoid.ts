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

export function renderAvoidList(avoid: AvoidList | null | undefined): string {
  if (!avoid || (!avoid.openers.length && !avoid.closers.length && !avoid.phrases.length)) return "";
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
  );
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
