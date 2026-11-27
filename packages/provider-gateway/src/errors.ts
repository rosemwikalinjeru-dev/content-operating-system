import { AppError } from "@contentos/shared";
import type { TokenUsage } from "./types";

export type ProviderErrorKind =
  | "refusal"
  | "max_tokens"
  | "invalid_output"
  | "rate_limited"
  | "overloaded"
  | "auth"
  | "bad_request"
  | "network"
  | "unknown";

/** A failed provider call. Carries any usage the provider billed so it can still be recorded. */
export class ProviderError extends AppError {
  readonly kind: ProviderErrorKind;
  readonly retryable: boolean;
  readonly usage: TokenUsage | null;
  readonly model: string | null;

  constructor(
    kind: ProviderErrorKind,
    message: string,
    opts: { retryable?: boolean; usage?: TokenUsage | null; model?: string | null; cause?: unknown } = {},
  ) {
    super(kind === "rate_limited" ? "RATE_LIMITED" : "PROVIDER_ERROR", message, { kind });
    this.name = "ProviderError";
    this.kind = kind;
    this.retryable = opts.retryable ?? false;
    this.usage = opts.usage ?? null;
    this.model = opts.model ?? null;
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}
