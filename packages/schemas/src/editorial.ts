/**
 * Phase 4 — editorial review shapes and API inputs. Pure (safe in the browser).
 */
import { z } from "zod";

export const REVIEW_DIMENSIONS = ["hook", "single_point", "story", "voice", "specificity", "craft"] as const;
export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number];

/** Weights out of 100. Voice and specificity carry the most: they are what generic AI gets wrong. */
export const DIMENSION_WEIGHTS: Record<ReviewDimension, number> = {
  hook: 20,
  single_point: 15,
  story: 15,
  voice: 20,
  specificity: 20,
  craft: 10,
};

export const DIMENSION_LABELS: Record<ReviewDimension, string> = {
  hook: "Hook strength",
  single_point: "One clear point",
  story: "Story with intention",
  voice: "Voice and cover test",
  specificity: "Specific, not generic",
  craft: "Platform craft",
};

export const MODEL_GATES = ["invented_story", "unsupported_claim"] as const;

export const ReviewOutput = z.object({
  dimensions: z
    .array(
      z.object({
        dimension: z.enum(REVIEW_DIMENSIONS),
        score: z.number().int().min(1).max(5),
        evidence: z.string().describe("A short exact quote from the draft that the score is based on."),
        reason: z.string().describe("One sentence."),
      }),
    )
    .describe("Exactly one entry per dimension."),
  cold_reader: z
    .object({
      score: z.number().int().min(1).max(5),
      reason: z.string(),
    })
    .nullable()
    .describe("Only for growth (top-of-funnel) drafts: could a business owner who has never heard of the author follow it and care? Otherwise null."),
  gates: z
    .array(
      z.object({
        code: z.enum(MODEL_GATES),
        section: z.string().nullable(),
        quote: z.string(),
        message: z.string(),
      }),
    )
    .describe("Only real failures. Empty when none."),
  suggestions: z
    .array(
      z.object({
        section: z.string().describe("The section key, e.g. s3."),
        dimension: z.enum(REVIEW_DIMENSIONS),
        issue: z.string(),
        text: z.string().describe("The full replacement text for that section."),
        headline: z.string().nullable(),
        on_screen: z.string().nullable(),
        broll: z.string().nullable(),
      }),
    )
    .describe("At most five, highest impact first. Each replaces one whole section."),
});
export type ReviewOutput = z.infer<typeof ReviewOutput>;

export const RuleProposals = z.object({
  rules: z
    .array(
      z.object({
        rule: z.string().describe("One imperative sentence about how the owner writes, e.g. 'Say clients, not customers.'"),
        rationale: z.string(),
        evidence_refs: z.array(z.string()),
      }),
    )
    .describe("At most three. Empty when there is no clear, repeatable pattern."),
});
export type RuleProposals = z.infer<typeof RuleProposals>;

export interface GateFailure {
  code: string;
  message: string;
  section: string | null;
  quote?: string;
  source: "check" | "reviewer";
}

export interface RepetitionFinding {
  kind: "phrase" | "hook";
  phrase: string;
  section: string | null;
  /** Where it was used before: "approved content" or "voice example". */
  seen_in: string;
}

export interface ReviewView {
  id: string;
  total_score: number;
  dimensions: ReviewOutput["dimensions"];
  cold_reader: ReviewOutput["cold_reader"];
  gate_failures: GateFailure[];
  repetition: RepetitionFinding[];
  reviewer_model: string | null;
  created_at: string;
  overrides: Array<{ gate: string; reason: string }>;
  suggestions: Array<{
    id: string;
    section_key: string;
    dimension: string;
    issue: string;
    rewrite: { text: string; headline: string | null; on_screen: string | null; broll: string | null };
    status: "pending" | "accepted" | "rejected";
    applied_version: number | null;
  }>;
}

export function weightedScore(dimensions: Array<{ dimension: ReviewDimension; score: number }>): number {
  let total = 0;
  for (const d of REVIEW_DIMENSIONS) {
    const hit = dimensions.find((x) => x.dimension === d);
    // A missing dimension scores the minimum rather than inflating the total.
    total += ((hit?.score ?? 1) - 1) / 4 * DIMENSION_WEIGHTS[d];
  }
  return Math.round(total * 10) / 10;
}

// ---------------------------------------------------------------------------
// API inputs
// ---------------------------------------------------------------------------

export const SuggestionDecision = z.object({ action: z.enum(["accept", "reject"]) });
export const GateOverrideCreate = z.object({
  gate: z.string().trim().min(1).max(60),
  reason: z.string().trim().min(5).max(1000),
});
export const LearnedRuleCreate = z.object({ rule: z.string().trim().min(5).max(300) });
export const LearnedRuleUpdate = z.object({ status: z.enum(["approved", "rejected", "disabled"]) });

export interface LearnedRuleRow {
  id: string;
  rule: string;
  rationale: string | null;
  evidence: Array<{ before?: string; after?: string; issue?: string }>;
  status: "proposed" | "approved" | "rejected" | "disabled";
  source: "edits" | "rejected_suggestions" | "owner";
  created_at: string;
}
