import { describe, expect, it, vi } from "vitest";
import type * as Pipeline from "./pipeline";

const pipeline = vi.hoisted(() => ({ runAnalyzeIdea: vi.fn(), runGenerateBrief: vi.fn() }));
vi.mock("./pipeline", async (orig) => ({ ...(await orig<typeof Pipeline>()), ...pipeline }));
vi.mock("./runtime", () => ({ pipelineDeps: vi.fn() }));

const { runJobInline } = await import("./runner");
const { NonRetryableJobError } = await import("./pipeline");

const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
const deps = { db: {} as never, controller: {} as never, logger: silent };
const sleep = vi.fn(async () => {});

describe("runJobInline", () => {
  it("runs the matching pipeline once on success", async () => {
    pipeline.runGenerateBrief.mockResolvedValueOnce(undefined);
    await runJobInline("generate_brief", "job-1", { deps, sleep });
    expect(pipeline.runGenerateBrief).toHaveBeenCalledWith(deps, "job-1", { finalAttempt: false });
    expect(pipeline.runAnalyzeIdea).not.toHaveBeenCalled();
  });

  it("retries retryable failures with backoff, flagging the last attempt as final", async () => {
    pipeline.runAnalyzeIdea.mockReset();
    pipeline.runAnalyzeIdea.mockRejectedValueOnce(new Error("overloaded")).mockRejectedValueOnce(new Error("overloaded")).mockResolvedValueOnce(undefined);
    sleep.mockClear();
    await runJobInline("analyze_idea", "job-1", { deps, sleep, backoffMs: (n) => n * 10 });
    expect(pipeline.runAnalyzeIdea.mock.calls.map((c) => c[2])).toEqual([
      { finalAttempt: false },
      { finalAttempt: false },
      { finalAttempt: true },
    ]);
    expect(sleep.mock.calls).toEqual([[20], [30]]);
  });

  it("stops immediately on a non-retryable failure", async () => {
    pipeline.runAnalyzeIdea.mockReset();
    pipeline.runAnalyzeIdea.mockRejectedValue(new NonRetryableJobError("BUDGET_EXCEEDED", "Daily budget reached."));
    await expect(runJobInline("analyze_idea", "job-1", { deps, sleep })).rejects.toBeInstanceOf(NonRetryableJobError);
    expect(pipeline.runAnalyzeIdea).toHaveBeenCalledTimes(1);
  });

  it("throws the last error after exhausting attempts", async () => {
    pipeline.runAnalyzeIdea.mockReset();
    pipeline.runAnalyzeIdea.mockRejectedValue(new Error("still down"));
    await expect(runJobInline("analyze_idea", "job-1", { deps, sleep, maxAttempts: 2 })).rejects.toThrow("still down");
    expect(pipeline.runAnalyzeIdea).toHaveBeenCalledTimes(2);
  });
});
