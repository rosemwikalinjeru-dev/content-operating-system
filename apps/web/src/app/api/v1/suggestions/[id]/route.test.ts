import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { db: {}, userId: "11111111-1111-4111-8111-111111111111", email: "owner@example.com" };
const repo = {
  getSuggestion: vi.fn(),
  decideSuggestion: vi.fn(),
  countUnusedRejections: vi.fn(),
  getVersionById: vi.fn(),
  getLatestVersion: vi.fn(),
  addAiVersionFromSuggestion: vi.fn(),
};
const enqueueJob = vi.fn();
vi.mock("@/lib/auth", () => ({ requireApiSession: async () => session }));
vi.mock("@contentos/database", () => repo);
vi.mock("@/lib/jobs", () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...a) }));

const { PATCH } = await import("./route");
const ID = "77777777-7777-4777-8777-777777777777";
const ctx = { params: Promise.resolve({ id: ID }) };
const req = (action: string) =>
  new NextRequest(`http://localhost/api/v1/suggestions/${ID}`, { method: "PATCH", body: JSON.stringify({ action }), headers: { "content-type": "application/json" } });

const section = (text: string) => ({ key: "s1", kind: "hook", text, headline: null, on_screen: null, broll: null });
const bodyWith = (text: string) => ({ format: "linkedin", sections: [section(text)], single_point: "", cover_test: "", placeholders: [], checks: [] });

beforeEach(() => {
  vi.clearAllMocks();
  repo.getSuggestion.mockResolvedValue({
    id: ID, asset_id: "a", version_id: "v1", section_key: "s1", issue: "Weak hook", status: "pending",
    rewrite: { text: "A plumber misses a call at 7am.", headline: null, on_screen: null, broll: null }, reviewer_model: "claude-sonnet-5-5",
  });
  repo.getVersionById.mockResolvedValue({ id: "v1", version: 1, body: bodyWith("Old hook") });
  enqueueJob.mockResolvedValue({ jobId: "job-9" });
});

describe("PATCH /api/v1/suggestions/:id", () => {
  it("accepts onto the latest version without a model call and queues a review", async () => {
    repo.getLatestVersion.mockResolvedValue({ id: "v3", version: 3, body: bodyWith("Old hook") });
    repo.addAiVersionFromSuggestion.mockResolvedValue({ id: "v4", version: 4 });
    const res = await PATCH(req("accept"), ctx);
    expect(res.status).toBe(200);
    const added = repo.addAiVersionFromSuggestion.mock.calls[0]![1];
    expect(added).toMatchObject({ parentVersion: 3, section: "s1", model: "claude-sonnet-5-5" });
    expect(added.body.sections[0].text).toBe("A plumber misses a call at 7am.");
    expect(repo.decideSuggestion).toHaveBeenCalledWith(session.db, ID, "accepted", 4);
    expect(enqueueJob.mock.calls[0]![2]).toMatchObject({ jobType: "review_version", payload: { version_id: "v4" } });
  });

  it("refuses to apply when the section changed since the review", async () => {
    repo.getLatestVersion.mockResolvedValue({ id: "v3", version: 3, body: bodyWith("Owner rewrote this") });
    expect((await PATCH(req("accept"), ctx)).status).toBe(409);
    expect(repo.addAiVersionFromSuggestion).not.toHaveBeenCalled();
  });

  it("rejects, and starts rule learning once two rejections are waiting", async () => {
    repo.countUnusedRejections.mockResolvedValue(1);
    await PATCH(req("reject"), ctx);
    expect(enqueueJob).not.toHaveBeenCalled();
    repo.countUnusedRejections.mockResolvedValue(2);
    await PATCH(req("reject"), ctx);
    expect(enqueueJob.mock.calls[0]![2]).toMatchObject({ jobType: "propose_rules" });
  });
});
