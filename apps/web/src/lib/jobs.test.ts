import type * as Shared from "@contentos/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  createJob: vi.fn(),
  setJobOrchestratorRun: vi.fn(),
  failJobToStart: vi.fn(),
  failJobIfActive: vi.fn(),
}));
const trigger = vi.hoisted(() => vi.fn());
const runJobInline = vi.hoisted(() => vi.fn());
const afterCallbacks = vi.hoisted(() => [] as Array<() => Promise<void>>);

vi.mock("@contentos/database", () => db);
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger } }));
vi.mock("@contentos/jobs/runner", () => ({ runJobInline }));
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => afterCallbacks.push(fn) }));
vi.mock("@contentos/shared", async (orig) => ({
  ...(await orig<typeof Shared>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() },
}));

const { enqueueJob, idempotencyHeader, jobRunner } = await import("./jobs");
const client = {} as never;
const input = { jobType: "analyze_idea" as const, idempotencyKey: "analyze:abc:123", payload: { idea_id: "i" } };
const runAfter = async () => {
  for (const fn of afterCallbacks.splice(0)) await fn();
};

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  trigger.mockResolvedValue({ id: "run_1" });
  runJobInline.mockResolvedValue(undefined);
  db.failJobIfActive.mockResolvedValue(true);
});

afterEach(() => {
  delete process.env.JOB_RUNNER;
});

describe("inline runner (default)", () => {
  it("is the default", () => {
    expect(jobRunner()).toBe("inline");
  });

  it("creates the job and runs it after the response, without touching Trigger.dev", async () => {
    db.createJob.mockResolvedValue({ id: "job-1", status: "queued", created: true });
    await expect(enqueueJob(client, "u", input)).resolves.toEqual({ jobId: "job-1", status: "queued", created: true });
    expect(runJobInline).not.toHaveBeenCalled(); // not before the response
    await runAfter();
    expect(runJobInline).toHaveBeenCalledWith("analyze_idea", "job-1");
    expect(trigger).not.toHaveBeenCalled();
  });

  it("ends the job if the run fails in a way the pipeline did not record", async () => {
    db.createJob.mockResolvedValue({ id: "job-1", status: "queued", created: true });
    runJobInline.mockRejectedValue(new Error("Worker environment is missing or invalid: SUPABASE_SERVICE_ROLE_KEY."));
    await enqueueJob(client, "u", input);
    await runAfter();
    expect(db.failJobIfActive).toHaveBeenCalledWith(client, "job-1", {
      code: "SERVICE_UNAVAILABLE",
      message: expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"),
    });
  });

  it("returns an existing job for a duplicate request without running it again", async () => {
    db.createJob.mockResolvedValue({ id: "job-1", status: "running", created: false });
    await expect(enqueueJob(client, "u", input)).resolves.toEqual({ jobId: "job-1", status: "running", created: false });
    expect(afterCallbacks).toHaveLength(0);
  });

  it("allows a retry after a failed job by creating a new one", async () => {
    db.createJob
      .mockResolvedValueOnce({ id: "job-old", status: "failed", created: false })
      .mockResolvedValueOnce({ id: "job-new", status: "queued", created: true });
    const res = await enqueueJob(client, "u", input);
    expect(res.jobId).toBe("job-new");
    expect(db.createJob.mock.calls[1]![2].idempotencyKey).toMatch(/^analyze:abc:123:retry:\d+$/);
    await runAfter();
    expect(runJobInline).toHaveBeenCalledWith("analyze_idea", "job-new");
  });
});

describe("Trigger.dev runner (JOB_RUNNER=trigger)", () => {
  beforeEach(() => {
    process.env.JOB_RUNNER = "trigger";
  });

  it("triggers the matching task with the job id and records the run id", async () => {
    db.createJob.mockResolvedValue({ id: "job-1", status: "queued", created: true });
    await enqueueJob(client, "u", input);
    expect(trigger).toHaveBeenCalledWith("analyze-idea", { jobId: "job-1" }, { idempotencyKey: "job-1" });
    expect(db.setJobOrchestratorRun).toHaveBeenCalledWith(client, "job-1", "run_1");
    expect(afterCallbacks).toHaveLength(0);
  });

  it("marks the job failed and returns 503 when Trigger.dev is unreachable", async () => {
    db.createJob.mockResolvedValue({ id: "job-1", status: "queued", created: true });
    trigger.mockRejectedValue(new Error("401 invalid secret key"));
    await expect(enqueueJob(client, "u", input)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(db.failJobToStart).toHaveBeenCalledWith(client, "job-1", expect.stringContaining("TRIGGER_SECRET_KEY"));
  });
});

describe("idempotencyHeader", () => {
  it("accepts well-formed keys and rejects others", () => {
    const req = (v?: string) => new Request("http://x", { headers: v ? { "idempotency-key": v } : {} });
    expect(idempotencyHeader(req("brief-1b2c3d4e"))).toBe("brief-1b2c3d4e");
    expect(idempotencyHeader(req("short"))).toBeNull();
    expect(idempotencyHeader(req("bad key with spaces!!"))).toBeNull();
    expect(idempotencyHeader(req())).toBeNull();
  });
});
