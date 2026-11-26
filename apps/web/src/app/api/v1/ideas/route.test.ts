import { AppError } from "@contentos/shared";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { db: {}, userId: "11111111-1111-4111-8111-111111111111", email: "owner@example.com" };
const requireApiSession = vi.fn();
const repo = {
  listIdeas: vi.fn(),
  createIdea: vi.fn(),
  getBrand: vi.fn(),
  getDefaultBrand: vi.fn(),
};

vi.mock("@/lib/auth", () => ({ requireApiSession: () => requireApiSession() }));
vi.mock("@contentos/database", () => repo);

const { GET, POST } = await import("./route");
const ctx = { params: Promise.resolve({}) };

function post(body: unknown) {
  return new NextRequest("http://localhost/api/v1/ideas", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireApiSession.mockResolvedValue(session);
});

describe("POST /api/v1/ideas", () => {
  it("returns 401 without a session and never touches the database", async () => {
    requireApiSession.mockRejectedValue(new AppError("UNAUTHORIZED", "Sign in required."));
    const res = await POST(post({ raw_input: "x" }), ctx);
    expect(res.status).toBe(401);
    expect(repo.createIdea).not.toHaveBeenCalled();
  });

  it("creates the idea on the default brand", async () => {
    repo.getDefaultBrand.mockResolvedValue({ id: "brand-1" });
    repo.createIdea.mockResolvedValue({ id: "idea-1" });
    const res = await POST(post({ raw_input: "AI won't fix a broken process", tags: ["AI"] }), ctx);
    expect(res.status).toBe(201);
    expect(repo.createIdea).toHaveBeenCalledWith(session.db, session.userId, "brand-1", {
      raw_input: "AI won't fix a broken process",
      tags: ["ai"],
    });
  });

  it("uses an explicit brand only after resolving it through RLS", async () => {
    repo.getBrand.mockRejectedValue(new AppError("NOT_FOUND", "Brand not found."));
    const res = await POST(post({ raw_input: "x", brand_id: "22222222-2222-4222-8222-222222222222" }), ctx);
    expect(res.status).toBe(404);
    expect(repo.createIdea).not.toHaveBeenCalled();
  });

  it("rejects invalid input with field details", async () => {
    const res = await POST(post({ raw_input: "" }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.details[0].path).toBe("raw_input");
  });

  it("ignores a client-supplied user_id", async () => {
    repo.getDefaultBrand.mockResolvedValue({ id: "brand-1" });
    repo.createIdea.mockResolvedValue({ id: "idea-1" });
    await POST(post({ raw_input: "x", user_id: "attacker" }), ctx);
    expect(repo.createIdea.mock.calls[0]![1]).toBe(session.userId);
    expect(repo.createIdea.mock.calls[0]![3]).not.toHaveProperty("user_id");
  });
});

describe("GET /api/v1/ideas", () => {
  it("validates the query before listing", async () => {
    const res = await GET(new NextRequest("http://localhost/api/v1/ideas?limit=500"), ctx);
    expect(res.status).toBe(400);
    expect(repo.listIdeas).not.toHaveBeenCalled();
  });

  it("returns a page", async () => {
    repo.listIdeas.mockResolvedValue({ data: [], next_cursor: null });
    const res = await GET(new NextRequest("http://localhost/api/v1/ideas?status=inbox"), ctx);
    expect(res.status).toBe(200);
    expect(repo.listIdeas.mock.calls[0]![1]).toMatchObject({ status: "inbox", limit: 25 });
  });
});
