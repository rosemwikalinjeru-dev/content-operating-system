import type { ModelRoute, TaskType } from "./types";

/**
 * Task → model routing. All tasks default to Claude Opus 5.5; depth is tuned with effort.
 * To route a task to a cheaper model (e.g. claude-sonnet-5-5 or claude-haiku-5-5), change it
 * here — the owner's decision, measured against the editorial eval set first.
 */
export const DEFAULT_ROUTES: Record<TaskType, ModelRoute> = {
  idea_analysis: {
    provider: "anthropic",
    model: "claude-opus-5-5",
    effort: "medium",
    maxTokens: 8_000,
    expectedOutputTokens: 2_500,
  },
  master_brief: {
    provider: "anthropic",
    model: "claude-opus-5-5",
    effort: "high",
    maxTokens: 16_000,
    expectedOutputTokens: 5_000,
  },
};
