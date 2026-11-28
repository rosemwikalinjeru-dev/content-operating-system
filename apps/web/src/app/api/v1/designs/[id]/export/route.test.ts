import { ROSE_NJERU_DEFAULTS } from "@contentos/schemas";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { db: {}, userId: "11111111-1111-4111-8111-111111111111", email: "owner@example.com" };
const repo = { getDesign: vi.fn(), designContext: vi.fn(), mediaDataUrls: vi.fn() };
const saveRender = vi.fn();
vi.mock("@/lib/auth", () => ({ requireApiSession: async () => session }));
vi.mock("@contentos/database", () => repo);
vi.mock("@/lib/renders", () => ({ saveRender: (...a: unknown[]) => saveRender(...a) }));

const { POST } = await import("./route");
const ID = "88888888-8888-4888-8888-888888888888";
const ctx = { params: Promise.resolve({ id: ID }) };
const req = (body: unknown) =>
  new NextRequest(`http://localhost/api/v1/designs/${ID}/export`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const base = { kicker: null, body: null, items: [], before: null, after: null, emphasis: [], visual: { type: "none" } };
const brand = { name: "Rose Njeru Automation", brand_guidelines: ROSE_NJERU_DEFAULTS.brand_guidelines };

beforeEach(() => {
  vi.clearAllMocks();
  repo.designContext.mockResolvedValue({ projectId: "p", brandId: "b", projectTitle: "Missed quotes", brand });
  repo.mediaDataUrls.mockResolvedValue({});
  saveRender.mockImplementation(async (i: { file: string }) => ({ id: "m", file: i.file, url: `https://signed/${i.file}` }));
});

describe("POST /api/v1/designs/:id/export", () => {
  it("blocks export while a slide fails readability, then allows it with a recorded reason", { timeout: 60_000 }, async () => {
    repo.getDesign.mockResolvedValue({
      id: ID,
      asset_id: "a",
      version: 2,
      template: "statement",
      slides: [
        { ...base, id: "d1", layout: "cover", headline: "Hook" },
        { ...base, id: "d2", layout: "statement", headline: "word ".repeat(30).trim() },
        { ...base, id: "d3", layout: "closing", headline: "End" },
      ],
    });
    const blocked = await POST(req({}), ctx);
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error.message).toMatch(/d2 \(4:5\): 30 words/);
    expect(saveRender).not.toHaveBeenCalled();

    const ok = await POST(req({ override_reason: "Dense on purpose for a checklist" }), ctx);
    expect(ok.status).toBe(201);
    const files = (await ok.json()).files.map((f: { file: string }) => f.file);
    expect(files).toEqual(["missed-quotes-v2-4x5.pdf", "missed-quotes-v2-4x5.zip", "missed-quotes-v2-4x5-slide-01.png", "missed-quotes-v2-4x5-slide-02.png", "missed-quotes-v2-4x5-slide-03.png"]);

    saveRender.mockClear();
    const both = await POST(req({ aspects: ["4:5", "1:1"], override_reason: "Dense on purpose for a checklist" }), ctx);
    const names = (await both.json()).files.map((f: { file: string }) => f.file);
    expect(names.filter((n: string) => n.includes("-1x1"))).toHaveLength(5);
    expect(saveRender.mock.calls.find((c) => c[0].file.endsWith("1x1-slide-01.png"))![0]).toMatchObject({ width: 1080, height: 1080 });
    expect(saveRender.mock.calls[0]![0]).toMatchObject({ overrideReason: "Dense on purpose for a checklist", designVersion: 2 });
  });
});
