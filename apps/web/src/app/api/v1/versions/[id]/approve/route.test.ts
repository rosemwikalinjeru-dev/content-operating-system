import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { db: {}, userId: "11111111-1111-4111-8111-111111111111", email: "owner@example.com" };
const repo = { getVersionById: vi.fn(), approveContentVersion: vi.fn(), gateSources: vi.fn(), listGateOverrides: vi.fn() };
vi.mock("@/lib/auth", () => ({ requireApiSession: async () => session }));
vi.mock("@contentos/database", () => repo);

const { PATCH } = await import("./route");
const ID = "66666666-6666-4666-8666-666666666666";
const ctx = { params: Promise.resolve({ id: ID }) };
const req = () => new NextRequest(`http://localhost/api/v1/versions/${ID}/approve`, { method: "PATCH" });

beforeEach(() => {
  vi.clearAllMocks();
  repo.gateSources.mockResolvedValue({ briefText: "", knowledgeText: "", banned: ["game-changer"] });
  repo.listGateOverrides.mockResolvedValue([]);
});

describe("PATCH /api/v1/versions/:id/approve", () => {
  it("blocks approval while placeholders remain", async () => {
    repo.getVersionById.mockResolvedValue({ id: ID, body: { placeholders: ["[client result]"] } });
    const res = await PATCH(req(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toContain("[client result]");
    expect(repo.approveContentVersion).not.toHaveBeenCalled();
  });

  it("approves a complete version", async () => {
    repo.getVersionById.mockResolvedValue({ id: ID, asset_id: "a", body: { placeholders: [], sections: [] } });
    repo.approveContentVersion.mockResolvedValue({ id: ID, status: "approved" });
    const res = await PATCH(req(), ctx);
    expect(res.status).toBe(200);
    expect(repo.approveContentVersion).toHaveBeenCalledWith(session.db, ID);
  });

  it("blocks a banned phrase or unsourced number until an override is recorded", async () => {
    const body = { placeholders: [], sections: [{ key: "s1", kind: "hook", text: "A game-changer: 47% of calls go unanswered.", headline: null, on_screen: null, broll: null }] };
    repo.getVersionById.mockResolvedValue({ id: ID, asset_id: "a", body });
    const res = await PATCH(req(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toMatch(/game-changer[\s\S]*47%/);
    repo.listGateOverrides.mockResolvedValue(["banned_phrase", "invented_number"]);
    repo.approveContentVersion.mockResolvedValue({ id: ID, status: "approved" });
    expect((await PATCH(req(), ctx)).status).toBe(200);
  });
});
