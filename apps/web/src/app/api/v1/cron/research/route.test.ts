import { NextRequest } from "next/server";
import type * as NextServer from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createDueResearchJobs = vi.fn();
const runJobInline = vi.fn();
vi.mock("@contentos/jobs/cron", () => ({ createDueResearchJobs: () => createDueResearchJobs() }));
vi.mock("@contentos/jobs/runner", () => ({ runJobInline: (...a: unknown[]) => runJobInline(...a) }));
const afterFns: Array<() => Promise<void>> = [];
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof NextServer>()), after: (fn: () => Promise<void>) => afterFns.push(fn) }));

const { GET } = await import("./route");
const ctx = { params: Promise.resolve({}) };
const req = (auth?: string) => new NextRequest("http://localhost/api/v1/cron/research", { headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  afterFns.length = 0;
  process.env.CRON_SECRET = "test-secret-value";
});

describe("GET /api/v1/cron/research", () => {
  it("rejects calls without the cron secret", async () => {
    expect((await GET(req(), ctx)).status).toBe(401);
    expect((await GET(req("Bearer wrong"), ctx)).status).toBe(401);
    expect(createDueResearchJobs).not.toHaveBeenCalled();
  });

  it("rejects everything when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer "), ctx)).status).toBe(401);
  });

  it("starts only newly created jobs for due schedules", async () => {
    createDueResearchJobs.mockResolvedValue([
      { scheduleId: "s1", userId: "u", jobId: "j1", created: true },
      { scheduleId: "s2", userId: "u", jobId: "j2", created: false },
    ]);
    const res = await GET(req("Bearer test-secret-value"), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ due: 2, started: 1 });
    for (const fn of afterFns) await fn();
    expect(runJobInline).toHaveBeenCalledTimes(1);
    expect(runJobInline).toHaveBeenCalledWith("research_sweep", "j1");
  });
});
