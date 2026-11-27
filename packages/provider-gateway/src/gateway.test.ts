import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AnthropicProvider, mapError } from "./anthropic";
import { UsageController, type SpendFilter, type UsageRecord, type UsageStore } from "./controller";
import { ProviderError } from "./errors";
import { costOf } from "./pricing";
import type { GenerateRequest, LLMProvider, ModelRoute } from "./types";

const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
const USER = "11111111-1111-4111-8111-111111111111";
const schema = z.object({ answer: z.string() });
const request: GenerateRequest<{ answer: string }> = {
  task: "idea_analysis",
  system: "You are a test.",
  messages: [{ role: "user", content: "hello" }],
  schema,
};
const usage = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 };

class MemoryStore implements UsageStore {
  rows: UsageRecord[] = [];
  constructor(private spent: Partial<Record<"day" | "month" | "project" | "job", number>> = {}) {}
  async spend(f: SpendFilter) {
    if (f.jobId) return this.spent.job ?? 0;
    if (f.projectId) return this.spent.project ?? 0;
    if (f.since && f.since.getUTCDate() === 1 && this.spent.month !== undefined) return this.spent.month;
    return this.spent.day ?? 0;
  }
  async record(row: UsageRecord) {
    this.rows.push(row);
  }
}

function provider(impl: (route: ModelRoute) => Promise<unknown>): LLMProvider {
  return {
    id: "anthropic",
    generate: vi.fn(async (_req, route) => impl(route)) as LLMProvider["generate"],
  };
}

const ok = (route: ModelRoute) =>
  Promise.resolve({ output: { answer: "x" }, provider: "anthropic", model: route.model, usage, costUsd: costOf(route.model, usage), durationMs: 5 });

const limits = { dailyUsd: 5, monthlyUsd: 50, projectUsd: 0.5 };
const now = () => new Date("2026-11-15T12:00:00Z");

describe("pricing", () => {
  it("computes cost including cache reads and writes", () => {
    // Opus 5.5: $4 in, $20 out, $0.20 cache read, cache write 1.25x input.
    expect(costOf("claude-opus-5-5", { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(4);
    expect(costOf("claude-opus-5-5", { inputTokens: 0, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(20);
    expect(costOf("claude-opus-5-5", { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 })).toBe(5.2);
  });

  it("prices unknown models pessimistically rather than as free", () => {
    expect(costOf("some-new-model", usage)).toBeGreaterThan(costOf("claude-opus-5-5", usage));
  });
});

describe("UsageController", () => {
  it("records a success row with actual cost and full traceability", async () => {
    const store = new MemoryStore();
    const c = new UsageController({ providers: [provider(ok)], store, now, logger: silent });
    const res = await c.generate(request, { userId: USER, projectId: "p", jobId: "j", stepId: "s", promptTemplateId: "t" }, limits);
    expect(res.output.answer).toBe("x");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      status: "success",
      userId: USER,
      projectId: "p",
      jobId: "j",
      stepId: "s",
      promptTemplateId: "t",
      model: "claude-sonnet-5-5",
      taskType: "idea_analysis",
      actualCost: costOf("claude-sonnet-5-5", usage),
    });
    expect(store.rows[0]!.estimatedCost).toBeGreaterThan(0);
  });

  it.each([
    ["daily", { day: 4.99 }, { dailyUsd: 5, monthlyUsd: 50 }],
    ["monthly", { month: 49.99 }, { dailyUsd: 5, monthlyUsd: 50 }],
    ["project", { project: 0.5 }, { dailyUsd: 5, monthlyUsd: 50, projectUsd: 0.5 }],
    ["job", { job: 2 }, { dailyUsd: 5, monthlyUsd: 50, jobUsd: 2 }],
  ] as const)("blocks the call when the %s budget would be exceeded, without calling the provider", async (scope, spent, lim) => {
    const store = new MemoryStore(spent);
    const p = provider(ok);
    const c = new UsageController({ providers: [p], store, now, logger: silent });
    await expect(c.generate(request, { userId: USER, projectId: "p", jobId: "j" }, lim)).rejects.toMatchObject({
      code: "BUDGET_EXCEEDED",
      details: { scope },
    });
    expect(p.generate).not.toHaveBeenCalled();
    expect(store.rows).toEqual([expect.objectContaining({ status: "blocked_budget", errorCode: "BUDGET_EXCEEDED", actualCost: null })]);
  });

  it("retries once on schema-invalid output and records both attempts", async () => {
    let calls = 0;
    const p = provider((route) => {
      calls++;
      if (calls === 1) return Promise.reject(new ProviderError("invalid_output", "bad", { retryable: true, usage, model: route.model }));
      return ok(route);
    });
    const store = new MemoryStore();
    const c = new UsageController({ providers: [p], store, now, logger: silent });
    await c.generate(request, { userId: USER }, limits);
    expect(store.rows.map((r) => [r.status, r.retryCount, r.errorCode])).toEqual([
      ["error", 0, "invalid_output"],
      ["success", 1, null],
    ]);
    // The failed attempt was still billed, so it is costed.
    expect(store.rows[0]!.actualCost).toBe(costOf("claude-sonnet-5-5", usage));
  });

  it("does not retry refusals or auth errors, and records them", async () => {
    for (const kind of ["refusal", "auth"] as const) {
      const store = new MemoryStore();
      const p = provider(() => Promise.reject(new ProviderError(kind, kind)));
      const c = new UsageController({ providers: [p], store, now, logger: silent });
      await expect(c.generate(request, { userId: USER }, limits)).rejects.toMatchObject({ kind });
      expect(p.generate).toHaveBeenCalledTimes(1);
      expect(store.rows[0]).toMatchObject({ status: "error", errorCode: kind });
    }
  });

  it("uses the owner's model choice, ignores models that are not allowed", async () => {
    const p = provider(ok);
    const store = new MemoryStore();
    const c = new UsageController({ providers: [p], store, now, logger: silent });
    await c.generate(request, { userId: USER }, limits, "claude-haiku-5-5");
    await c.generate(request, { userId: USER }, limits, "gpt-something");
    await c.generate(request, { userId: USER }, limits);
    expect(store.rows.map((r) => r.model)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5", "claude-sonnet-5-5"]);
    expect(c.route("master_brief", "claude-opus-5-5").model).toBe("claude-opus-5-5");
    expect(c.route("master_brief").effort).toBe("high");
  });

  it("estimates a cheaper model as cheaper", () => {
    const c = new UsageController({ providers: [provider(ok)], store: new MemoryStore(), now, logger: silent });
    const opus = c.estimate(request, c.route("idea_analysis", "claude-opus-5-5"));
    const sonnet = c.estimate(request, c.route("idea_analysis"));
    const haiku = c.estimate(request, c.route("idea_analysis", "claude-haiku-5-5"));
    expect(sonnet).toBeCloseTo(opus / 2, 6);
    expect(haiku).toBeLessThan(sonnet / 10);
  });

  it("returns the result even if the ledger write fails, and logs it", async () => {
    const store: UsageStore = { spend: async () => 0, record: async () => Promise.reject(new Error("db down")) };
    const log = { ...silent, error: vi.fn() };
    const c = new UsageController({ providers: [provider(ok)], store, now, logger: log });
    await expect(c.generate(request, { userId: USER }, limits)).resolves.toMatchObject({ output: { answer: "x" } });
    expect(log.error).toHaveBeenCalledWith("usage_record_failed", expect.anything());
  });
});

describe("AnthropicProvider", () => {
  function fakeClient(response: object) {
    const parse = vi.fn().mockResolvedValue(response);
    return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
  }
  const apiUsage = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 200, cache_creation_input_tokens: 0 };
  const route: ModelRoute = { provider: "anthropic", model: "claude-opus-5-5", effort: "medium", maxTokens: 8000, expectedOutputTokens: 1000 };

  it("sends adaptive thinking, effort, structured output, fallbacks and caching", async () => {
    const { client, parse } = fakeClient({ model: "claude-opus-5-5", stop_reason: "end_turn", parsed_output: { answer: "y" }, usage: apiUsage });
    const res = await new AnthropicProvider(client).generate(request, route);
    expect(res.output).toEqual({ answer: "y" });
    expect(res.usage).toEqual({ inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheWriteTokens: 0 });
    const args = parse.mock.calls[0]![0];
    expect(args).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
      cache_control: { type: "ephemeral" },
      system: "You are a test.",
    });
    expect(args.output_config.effort).toBe("medium");
    expect(args.output_config.format).toBeDefined();
    expect(args).not.toHaveProperty("temperature");
  });

  it("omits server-side fallbacks for Haiku 5.5, which does not support them", async () => {
    const { client, parse } = fakeClient({ model: "claude-haiku-5-5", stop_reason: "end_turn", parsed_output: { answer: "y" }, usage: apiUsage });
    await new AnthropicProvider(client).generate(request, { ...route, model: "claude-haiku-5-5" });
    const args = parse.mock.calls[0]![0];
    expect(args).not.toHaveProperty("fallbacks");
    expect(args).not.toHaveProperty("betas");
    expect(args.thinking).toEqual({ type: "adaptive" });
  });

  it("costs the response at the model that actually served it (fallback)", async () => {
    const { client } = fakeClient({ model: "claude-opus-4-8", stop_reason: "end_turn", parsed_output: { answer: "y" }, usage: apiUsage });
    const res = await new AnthropicProvider(client).generate(request, route);
    expect(res.model).toBe("claude-opus-4-8");
    expect(res.costUsd).toBe(costOf("claude-opus-4-8", res.usage));
  });

  it.each([
    ["refusal", { stop_reason: "refusal", stop_details: { category: "cyber" }, parsed_output: null }],
    ["max_tokens", { stop_reason: "max_tokens", parsed_output: null }],
    ["invalid_output", { stop_reason: "end_turn", parsed_output: { wrong: 1 } }],
  ])("raises %s with the billed usage attached", async (kind, extra) => {
    const { client } = fakeClient({ model: "claude-opus-5-5", usage: apiUsage, ...extra });
    const err = await new AnthropicProvider(client).generate(request, route).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe(kind);
    expect(err.usage).not.toBeNull();
  });

  it("maps typed SDK errors without string matching", () => {
    const headers = new Headers();
    expect(mapError(new Anthropic.RateLimitError(429, undefined, "slow", headers))).toMatchObject({ kind: "rate_limited", retryable: true });
    expect(mapError(new Anthropic.AuthenticationError(401, undefined, "no", headers))).toMatchObject({ kind: "auth", retryable: false });
    expect(mapError(new Anthropic.APIConnectionError({ message: "down" }))).toMatchObject({ kind: "network", retryable: true });
    expect(mapError(new Error("boom"))).toMatchObject({ kind: "unknown" });
  });
});
