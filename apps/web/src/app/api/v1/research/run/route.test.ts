import { AppError } from "@contentos/shared";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { db: {}, userId: "11111111-1111-4111-8111-111111111111", email: "owner@example.com" };
const requireApiSession = vi.fn();
const enqueueJob = vi.fn();
vi.mock("@/lib/auth", () => ({ requireApiSession: () => requireApiSession() }));
vi.mock("@/lib/jobs", async () => ({
  enqueueJob: (...a: unknown[]) => enqueueJob(...a),
  idempotencyHeader: () => null,
  shortHash: (v: unknown) => JSON.stringify(v).length.toString(16),
}));

const { POST } = await import("./route");
const ctx = { params: Promise.resolve({}) };
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/v1/research/run", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  requireApiSession.mockResolvedValue(session);
  enqueueJob.mockResolvedValue({ jobId: "job-1", status: "queued", created: true });
});

describe("POST /api/v1/research/run", () => {
  it("requires a session", async () => {
    requireApiSession.mockRejectedValue(new AppError("UNAUTHORIZED", "Sign in required."));
    expect((await POST(post({}), ctx)).status).toBe(401);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("enqueues a research sweep with validated defaults", async () => {
    const res = await POST(post({ cluster_ids: ["A"] }), ctx);
    expect(res.status).toBe(202);
    expect(enqueueJob).toHaveBeenCalledWith(session.db, session.userId, {
      jobType: "research_sweep",
      idempotencyKey: expect.stringMatching(/^research:/),
      payload: { cluster_ids: ["A"], include_competitors: true, max_queries: 6, max_credits: 30 },
    });
  });

  it("refuses a credit cap above the limit", async () => {
    expect((await POST(post({ max_credits: 500 }), ctx)).status).toBe(400);
  });
});
