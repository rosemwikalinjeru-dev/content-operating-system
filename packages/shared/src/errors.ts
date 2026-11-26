/**
 * Structured application errors. Every API error response is built from one of these codes,
 * so clients can branch on `code` rather than parse messages.
 */
export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  BUDGET_EXCEEDED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  PROVIDER_ERROR: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/** Postgres / PostgREST error codes we translate into application errors. */
const PG_CODE_MAP: Record<string, { code: ErrorCode; message: string }> = {
  "23505": { code: "CONFLICT", message: "A record with these values already exists." },
  "23503": { code: "VALIDATION_FAILED", message: "A referenced record does not exist." },
  "23514": { code: "VALIDATION_FAILED", message: "The record violates a data rule." },
  "42501": { code: "FORBIDDEN", message: "You do not have access to this record." },
  P0001: { code: "CONFLICT", message: "This record cannot be changed in its current state." },
  PGRST116: { code: "NOT_FOUND", message: "Record not found." },
};

/** Convert a database error ({ code, message }) into an AppError without leaking internals. */
export function fromDatabaseError(err: { code?: string; message?: string } | null | undefined): AppError {
  const mapped = err?.code ? PG_CODE_MAP[err.code] : undefined;
  if (mapped) return new AppError(mapped.code, mapped.message, { dbCode: err?.code });
  return new AppError("INTERNAL", "Database request failed.", { dbCode: err?.code });
}
