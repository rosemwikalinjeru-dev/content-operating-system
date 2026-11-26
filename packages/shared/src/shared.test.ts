import { describe, expect, it } from "vitest";
import { AppError, decodeCursor, encodeCursor, fromDatabaseError, isAllowedEmail, parseAllowlist, redact } from "./index";

describe("cursor", () => {
  it("round-trips", () => {
    const c = { createdAt: "2026-11-26T10:00:00.000Z", id: "7c9e6679-7425-40de-944b-e07fc1f90ae7" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("preserves microsecond precision from Postgres (regression)", () => {
    const c = { createdAt: "2026-11-26T10:00:00.123456+00:00", id: "7c9e6679-7425-40de-944b-e07fc1f90ae7" };
    expect(decodeCursor(encodeCursor(c)).createdAt).toBe("2026-11-26T10:00:00.123456+00:00");
  });

  it.each(["", Buffer.from('["2026-11-26","7c9e6679-7425-40de-944b-e07fc1f90ae7"]').toString("base64url"), "not-base64", Buffer.from('["x","y"]').toString("base64url"), Buffer.from("{}").toString("base64url")])(
    "rejects malformed token %j",
    (token) => {
      expect(() => decodeCursor(token)).toThrow(AppError);
    },
  );
});

describe("allowlist", () => {
  it("matches case-insensitively and trims", () => {
    const list = parseAllowlist(" Owner@Example.com , other@example.com");
    expect(isAllowedEmail("owner@example.COM", list)).toBe(true);
    expect(isAllowedEmail("intruder@example.com", list)).toBe(false);
  });

  it("fails closed when unset", () => {
    expect(isAllowedEmail("owner@example.com", parseAllowlist(undefined))).toBe(false);
    expect(isAllowedEmail("owner@example.com", parseAllowlist(" , "))).toBe(false);
    expect(isAllowedEmail(null, parseAllowlist("a@b.c"))).toBe(false);
  });
});

describe("errors", () => {
  it("maps database codes without leaking messages", () => {
    const e = fromDatabaseError({ code: "23505", message: 'duplicate key value violates unique constraint "x"' });
    expect(e.code).toBe("CONFLICT");
    expect(e.status).toBe(409);
    expect(e.message).not.toContain("constraint");
    expect(fromDatabaseError({ code: "XX000" }).code).toBe("INTERNAL");
    expect(fromDatabaseError({ code: "PGRST116" }).status).toBe(404);
  });
});

describe("redact", () => {
  it("redacts sensitive keys recursively", () => {
    expect(redact({ a: 1, headers: { Authorization: "Bearer x", cookie: "y" }, list: [{ apiKey: "k" }] })).toEqual({
      a: 1,
      headers: { Authorization: "[redacted]", cookie: "[redacted]" },
      list: [{ apiKey: "[redacted]" }],
    });
  });
});
