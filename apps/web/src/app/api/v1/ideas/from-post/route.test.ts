import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { db: {}, userId: "11111111-1111-4111-8111-111111111111", email: "owner@example.com" };
const repo = { createIdeaFromPost: vi.fn(), getDefaultBrand: vi.fn() };
vi.mock("@/lib/auth", () => ({ requireApiSession: async () => session }));
vi.mock("@contentos/database", () => repo);

const { POST } = await import("./route");
const ctx = { params: Promise.resolve({}) };
const req = (body: unknown) =>
  new NextRequest("http://localhost/api/v1/ideas/from-post", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  repo.getDefaultBrand.mockResolvedValue({ id: "brand-1" });
  repo.createIdeaFromPost.mockResolvedValue({ id: "idea-1" });
});

describe("POST /api/v1/ideas/from-post", () => {
  it("stores the post with the chosen formats on the default brand", async () => {
    const body = { post: { text: "A long enough post about automation and workflows.", author: "Jane", url: "https://www.linkedin.com/posts/x" }, take: "I disagree", formats: ["carousel", "short_video"] };
    const res = await POST(req(body), ctx);
    expect(res.status).toBe(201);
    expect(repo.createIdeaFromPost).toHaveBeenCalledWith(session.db, session.userId, "brand-1", expect.objectContaining({ formats: ["carousel", "short_video"], post: expect.objectContaining({ platform: "linkedin" }) }));
  });

  it("rejects a too-short post and a missing format", async () => {
    expect((await POST(req({ post: { text: "short", author: "J" }, formats: ["carousel"] }), ctx)).status).toBe(400);
    expect((await POST(req({ post: { text: "A long enough post about automation and workflows.", author: "J" }, formats: [] }), ctx)).status).toBe(400);
  });
});
