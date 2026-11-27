/** Pure scoring of an editorial eval run (unit-tested; no model calls). */
export interface EvalScore {
  id: string;
  group: "owner" | "generic";
  score: number;
}

export interface EvalReport {
  prompt: { name: string; version: number; hash: string };
  model: string;
  ran_at: string;
  owner: { n: number; mean: number; min: number };
  generic: { n: number; mean: number; max: number };
  /** Mean owner score minus mean generic score, in points out of 100. */
  gap: number;
  /** Share of owner/generic pairs where the owner post scored higher (0–1). */
  pairwise: number;
  passed: boolean;
  scores: EvalScore[];
  notes: string[];
}

export const PASS_GAP = 15;
export const PASS_PAIRWISE = 0.85;
export const MIN_OWNER_POSTS = 10;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (n: number) => Math.round(n * 10) / 10;

export function buildReport(input: Omit<EvalReport, "owner" | "generic" | "gap" | "pairwise" | "passed" | "notes">): EvalReport {
  const owner = input.scores.filter((s) => s.group === "owner").map((s) => s.score);
  const generic = input.scores.filter((s) => s.group === "generic").map((s) => s.score);
  let wins = 0;
  for (const o of owner) for (const g of generic) wins += o > g ? 1 : o === g ? 0.5 : 0;
  const pairs = owner.length * generic.length;
  const pairwise = pairs ? wins / pairs : 0;
  const gap = mean(owner) - mean(generic);
  const notes: string[] = [];
  if (owner.length < MIN_OWNER_POSTS) {
    notes.push(`Only ${owner.length} owner posts; add at least ${MIN_OWNER_POSTS} to evals/editorial/owner-posts for a reliable result.`);
  }
  return {
    ...input,
    owner: { n: owner.length, mean: round(mean(owner)), min: owner.length ? Math.min(...owner) : 0 },
    generic: { n: generic.length, mean: round(mean(generic)), max: generic.length ? Math.max(...generic) : 0 },
    gap: round(gap),
    pairwise: Math.round(pairwise * 1000) / 1000,
    passed: gap >= PASS_GAP && pairwise >= PASS_PAIRWISE && owner.length >= MIN_OWNER_POSTS,
    notes,
  };
}
