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

const MISSING_MIGRATION = {
  code: "SERVICE_UNAVAILABLE" as const,
  message: "The database is missing a migration. Apply the newest file in supabase/migrations in the Supabase SQL Editor.",
};
const BAD_CREDENTIALS = {
  code: "SERVICE_UNAVAILABLE" as const,
  message: "The database rejected the server key. Check SUPABASE_SERVICE_ROLE_KEY (the secret key, not the publishable key).",
};

// Schema drift: undefined column / table / function, or not in PostgREST's schema cache.
for (const c of ["42703", "42P01", "42883", "PGRST200", "PGRST202", "PGRST204", "PGRST205"]) PG_CODE_MAP[c] = MISSING_MIGRATION;
// Authentication failures from PostgREST / Postgres.
for (const c of ["PGRST301", "PGRST302", "28P01", "28000"]) PG_CODE_MAP[c] = BAD_CREDENTIALS;

/** Convert a database error ({ code, message }) into an AppError without leaking internals. */
export function fromDatabaseError(err: { code?: string; message?: string } | null | undefined): AppError {
  const mapped = err?.code ? PG_CODE_MAP[err.code] : undefined;
  if (mapped) return new AppError(mapped.code, mapped.message, { dbCode: err?.code });
  // The API gateway rejects an unknown key before PostgREST, with no error code.
  if (!err?.code && err?.message === "Invalid API key") {
    return new AppError(BAD_CREDENTIALS.code, BAD_CREDENTIALS.message, { dbCode: "invalid_api_key" });
  }
  return new AppError("INTERNAL", "Database request failed.", { dbCode: err?.code });
}
