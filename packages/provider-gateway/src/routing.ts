import type { ModelRoute, TaskType } from "./types";

/**
 * Task → model routing. Owner decision (2026-11-27): use a cheaper model by default to protect
 * credits — Claude Sonnet 5.5 (half the price of Opus 5.5). The owner can move any task to
 * another allowed model in Settings; that choice overrides the model here, effort stays.
 */
export const ALLOWED_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export type AllowedModel = (typeof ALLOWED_MODELS)[number];

/** Models that support server-side refusal fallbacks (Haiku 5.5 does not). */
export const SUPPORTS_SERVER_FALLBACK: ReadonlySet<string> = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);
export const DEFAULT_ROUTES: Record<TaskType, ModelRoute> = {
  idea_analysis: {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    effort: "medium",
    maxTokens: 8_000,
    expectedOutputTokens: 2_500,
  },
  // Bulk classification of research posts: cheapest model, low effort.
  research_labeling: {
    provider: "anthropic",
    model: "claude-haiku-5-5",
    effort: "low",
    maxTokens: 6_000,
    expectedOutputTokens: 2_000,
  },
  gap_synthesis: {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    effort: "medium",
    maxTokens: 10_000,
    expectedOutputTokens: 3_000,
  },
  master_brief: {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    effort: "high",
    maxTokens: 16_000,
    expectedOutputTokens: 5_000,
  },
};
