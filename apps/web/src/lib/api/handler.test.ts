import { AppError } from "@contentos/shared";
import type * as Shared from "@contentos/shared";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { api, json, parseJson, parseQuery } from "./handler";

vi.mock("@contentos/shared", async (orig) => {
  const mod = await orig<typeof Shared>();
  return { ...mod, logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() } };
});

const ctx = { params: Promise.resolve({}) };

function req(body: string | undefined, init: { contentType?: string; url?: string } = {}) {
  return new NextRequest(init.url ?? "http://localhost/api/v1/test", {
    method: body === undefined ? "GET" : "POST",
    body,
    headers: init.contentType ? { "content-type": init.contentType } : {},
  });
}

describe("api wrapper", () => {
  it("returns structured errors with a request id and no-store", async () => {
    const handler = api(async () => {
      throw new AppError("NOT_FOUND", "Idea not found.");
    });
    const res = await handler(req(undefined), ctx);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.request_id).toBe(res.headers.get("x-request-id"));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("hides unexpected error messages", async () => {
    const handler = api(async () => {
      throw new Error("connection string postgres://secret leaked");
    });
    const res = await handler(req(undefined), ctx);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("secret");
  });

  it("passes successful responses through", async () => {
    const res = await api(async () => json({ ok: true }, 201))(req(undefined), ctx);
    expect(res.status).toBe(201);
  });
});

describe("parseJson", () => {
  const Schema = z.object({ name: z.string().min(1) });

  it("requires JSON content type", async () => {
    await expect(parseJson(req('{"name":"a"}', { contentType: "text/plain" }), Schema)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("rejects malformed JSON and schema violations with details", async () => {
    await expect(parseJson(req("{", { contentType: "application/json" }), Schema)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(parseJson(req('{"name":""}', { contentType: "application/json" }), Schema)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: [{ path: "name" }],
    });
  });

  it("rejects oversized bodies", async () => {
    const big = JSON.stringify({ name: "x".repeat(300 * 1024) });
    await expect(parseJson(req(big, { contentType: "application/json" }), Schema)).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });
  });

  it("parses valid bodies", async () => {
    await expect(parseJson(req('{"name":"ok"}', { contentType: "application/json; charset=utf-8" }), Schema)).resolves.toEqual({ name: "ok" });
  });
});

describe("parseQuery", () => {
  it("validates search params", () => {
    const S = z.object({ limit: z.coerce.number().max(10) });
    expect(parseQuery(req(undefined, { url: "http://localhost/x?limit=5" }), S)).toEqual({ limit: 5 });
    expect(() => parseQuery(req(undefined, { url: "http://localhost/x?limit=50" }), S)).toThrow(AppError);
  });
});
