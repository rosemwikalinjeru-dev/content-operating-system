import type { TokenUsage } from "./types";

/**
 * USD per million tokens, Anthropic first-party rates (cached 2026-11-03).
 * Cache writes (5-minute TTL) bill at 1.25x input. Update when provider prices change.
 */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
}

export const PRICES: Record<string, ModelPrice> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
};

const CACHE_WRITE_MULTIPLIER = 1.25;

/** Most expensive known price; used when a response comes from an unlisted model. */
const FALLBACK_PRICE: ModelPrice = { input: 10, output: 50, cacheRead: 1 };

export function priceFor(model: string): { price: ModelPrice; known: boolean } {
  const price = PRICES[model];
  return price ? { price, known: true } : { price: FALLBACK_PRICE, known: false };
}

export function costOf(model: string, usage: TokenUsage): number {
  const { price } = priceFor(model);
  const usd =
    (usage.inputTokens * price.input +
      usage.cacheWriteTokens * price.input * CACHE_WRITE_MULTIPLIER +
      usage.cacheReadTokens * price.cacheRead +
      usage.outputTokens * price.output) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Rough token estimate for budget pre-checks (no network call). ~3.5 chars per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
