import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ProviderError } from "./errors";
import { costOf } from "./pricing";
import { SUPPORTS_SERVER_FALLBACK } from "./routing";
import type { GenerateRequest, GenerateResult, LLMProvider, ModelRoute, TokenUsage } from "./types";

/**
 * Claude adapter.
 *  - Structured output: `beta.messages.parse` + Zod output format (schema-constrained JSON,
 *    parsed and validated by the SDK; unsupported constraints are validated client-side).
 *  - Adaptive thinking with per-route effort.
 *  - Server-side refusal fallbacks ("default" routing by refusal category) on models that
 *    support them; Haiku 5.5 has none, so the parameter is omitted there.
 *  - Top-level prompt caching: the system prompt (Brand DNA) is stable across calls.
 *  - The SDK retries 408/409/429/5xx and connection errors (maxRetries 2).
 * The API key comes from ANTHROPIC_API_KEY in the worker environment, never from callers.
 */
export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic";
  private readonly client: Anthropic;

  constructor(client?: Anthropic) {
    this.client = client ?? new Anthropic({ maxRetries: 2, timeout: 180_000 });
  }

  async generate<T>(request: GenerateRequest<T>, route: ModelRoute): Promise<GenerateResult<T>> {
    const started = Date.now();
    let response;
    try {
      const fallback = SUPPORTS_SERVER_FALLBACK.has(route.model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {};
      response = await this.client.beta.messages.parse({
        model: route.model,
        max_tokens: route.maxTokens,
        ...fallback,
        thinking: { type: "adaptive" },
        output_config: { effort: route.effort, format: betaZodOutputFormat(request.schema) },
        cache_control: { type: "ephemeral" },
        system: request.system,
        messages: request.messages,
      });
    } catch (err) {
      throw mapError(err);
    }

    const usage = toUsage(response.usage);
    const model = response.model;
    const durationMs = Date.now() - started;

    if (response.stop_reason === "refusal") {
      const category = response.stop_details?.category ?? "unspecified";
      throw new ProviderError("refusal", `The model declined this request (${category}).`, { usage, model });
    }
    if (response.stop_reason === "max_tokens") {
      throw new ProviderError("max_tokens", "The response was cut off at the token limit.", { usage, model });
    }

    const parsed = response.parsed_output;
    const checked = parsed == null ? null : request.schema.safeParse(parsed);
    if (!checked?.success) {
      throw new ProviderError("invalid_output", "The model returned output that does not match the schema.", {
        retryable: true,
        usage,
        model,
      });
    }

    return { output: checked.data, provider: this.id, model, usage, costUsd: costOf(model, usage), durationMs };
  }
}

function toUsage(u: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
}): TokenUsage {
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}

/** Typed SDK errors → ProviderError, most specific first. Never string-matches messages. */
export function mapError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError("auth", "The AI provider rejected the API key.", { cause: err });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ProviderError("rate_limited", "The AI provider is rate limiting requests.", { retryable: true, cause: err });
  }
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError) {
    return new ProviderError("bad_request", "The AI provider rejected the request.", { cause: err });
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new ProviderError("overloaded", "The AI provider is unavailable.", { retryable: true, cause: err });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ProviderError("network", "Could not reach the AI provider.", { retryable: true, cause: err });
  }
  if (err instanceof Anthropic.APIError) {
    return new ProviderError("unknown", `AI provider error (${err.status ?? "no status"}).`, { cause: err });
  }
  return new ProviderError("unknown", "Unexpected error calling the AI provider.", { cause: err });
}
