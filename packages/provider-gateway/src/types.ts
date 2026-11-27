import type { z } from "zod";

/** Every AI task the system performs. Routing, budgets and the usage ledger key on this. */
export type TaskType = "idea_analysis" | "master_brief";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelRoute {
  provider: "anthropic";
  model: string;
  effort: Effort;
  /** Hard ceiling per response (includes thinking tokens). */
  maxTokens: number;
  /** Typical output, used for the pre-call cost estimate. */
  expectedOutputTokens: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateRequest<T> {
  task: TaskType;
  /** Stable instructions (cacheable): global rules, Brand DNA, skill, output contract. */
  system: string;
  /** Volatile, request-specific content. External content must be wrapped as data. */
  messages: ChatMessage[];
  schema: z.ZodType<T>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface GenerateResult<T> {
  output: T;
  provider: string;
  /** Model that actually served the response (may differ from the route after a fallback). */
  model: string;
  usage: TokenUsage;
  costUsd: number;
  durationMs: number;
}

export interface LLMProvider {
  id: string;
  generate<T>(request: GenerateRequest<T>, route: ModelRoute): Promise<GenerateResult<T>>;
}
