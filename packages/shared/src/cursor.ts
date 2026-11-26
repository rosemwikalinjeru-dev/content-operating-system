/**
 * Opaque keyset-pagination cursor over (created_at desc, id desc).
 * Encoded as base64url JSON so clients treat it as a token, not a query.
 */
import { AppError } from "./errors";

export interface Cursor {
  createdAt: string;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// ISO-8601 with optional fractional seconds of ANY precision and a zone.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id]), "utf8").toString("base64url");
}

export function decodeCursor(token: string): Cursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string" &&
      TIMESTAMP.test(parsed[0]) &&
      UUID.test(parsed[1])
    ) {
      // Keep the timestamp string exactly as Postgres returned it. Postgres stores
      // microseconds; round-tripping through Date would truncate to milliseconds and the
      // next page would skip rows created within the same millisecond.
      return { createdAt: parsed[0], id: parsed[1] };
    }
  } catch {
    // fall through
  }
  throw new AppError("VALIDATION_FAILED", "Invalid pagination cursor.");
}
