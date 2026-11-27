import { ScrapeCreatorsError, type ResearchItem } from "@contentos/research-engine";
import type { UsageController } from "@contentos/provider-gateway";
import { ROSE_NJERU_DEFAULTS } from "@contentos/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({
  loadJob: vi.fn(),
  updateJob: vi.fn(),
  beginStep: vi.fn(),
  finishStep: vi.fn(),
  loadBrand: vi.fn(),
  loadSettings: vi.fn(),
  sumSpend: vi.fn(),
  insertUsage: vi.fn(),
  defaultBrandId: vi.fn(),
  loadQueriesForRun: vi.fn(),
  loadCompetitorsForRun: vi.fn(),
  upsertSources: vi.fn(),
  loadSources: vi.fn(),
  recentCompetitorSourceIds: vi.fn(),
  updateSource: vi.fn(),
  touchQueries: vi.fn(),
  touchCompetitors: vi.fn(),
  insertResearchReport: vi.fn(),
  updateReportFindings: vi.fn(),
  insertResearchIdeas: vi.fn(),
  ensurePromptTemplate: vi.fn(),
}));
vi.mock("@contentos/database/service", () => svc);

const { runResearchSweep } = await import("./research");
const { NonRetryableJobError } = await import("./pipeline");

const USER = "11111111-1111-4111-8111-111111111111";
const brand = { id: "brand-1", is_default: true, status: "active", created_at: "", updated_at: "t1", ...ROSE_NJERU_DEFAULTS };
const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };

function item(n: number, author: string, likes: number, text = `post ${n}`): ResearchItem {
  return {
    platform: "reddit",
    externalId: String(n),
    url: `https://www.reddit.com/r/smallbusiness/comments/${n}`,
    text,
    author,
    publishedAt: null,
    metrics: { views: null, likes, comments: 0, shares: 0 },
    rawKeys: ["title"],
  };
}

/** In-memory research_sources table shared by the mocked data functions. */
let store: Map<string, { id: string; hash: string; row: Record<string, unknown>; labels: Record<string, unknown> }>;

function fakeClient(opts: { fail?: ScrapeCreatorsError } = {}) {
  const client = {
    creditsUsed: 0,
    search: vi.fn(async () => {
      if (opts.fail) throw opts.fail;
      client.creditsUsed++;
      // Author "a" has a baseline of ~10 likes; post 1 is a 10x outlier about founder dependency.
      const items = [item(1, "a", 100, "My business stops when I go on holiday")];
      for (let n = 2; n <= 7; n++) items.push(item(n, "a", 10));
      return { payload: {}, items, credits: 1 };
    }),
    feed: vi.fn(async () => {
      client.creditsUsed++;
      return { payload: {}, items: [], credits: 1 };
    }),
  };
  return client;
}

function controller() {
  return {
    generate: vi.fn(async (req: { task: string; messages: Array<{ content: string }> }) => {
      if (req.task === "research_labeling") {
        const refs = [...req.messages[0]!.content.matchAll(/\[ref: (s\d+)\]/g)].map((m) => m[1]!);
        return {
          output: {
            items: refs.map((ref) => ({
              ref,
              topic: ref === "s1" ? "founder dependency" : "generic tips",
              cluster_id: "A",
              hook_pattern: "question",
              is_question: true,
              owner_audience: true,
              brand_fit: 0.9,
            })),
          },
          provider: "anthropic",
          model: "claude-haiku-5-5",
          usage,
          costUsd: 0.002,
          durationMs: 1,
        };
      }
      return {
        output: {
          ideas: [
            {
              gap_topic: "founder dependency",
              title: "The business that stops when the owner rests",
              raw_input: "Owners say the business stops when they take a day off. [my example]",
              angle: "Dependency is a process gap, not a work ethic problem",
              funnel_stage: "authority",
              why_gap: "Asked often, rarely covered by tracked creators.",
              evidence_refs: ["e1", "e99"],
            },
          ],
        },
        provider: "anthropic",
        model: "claude-sonnet-5-5",
        usage,
        costUsd: 0.03,
        durationMs: 1,
      };
    }),
    estimate: vi.fn(() => 0.01),
  } as unknown as UsageController & { generate: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.clearAllMocks();
  store = new Map();
  svc.loadJob.mockResolvedValue({
    id: "job-1",
    user_id: USER,
    job_type: "research_sweep",
    status: "queued",
    project_id: null,
    input: { max_queries: 2, max_credits: 10 },
    budget_limit_usd: null,
  });
  svc.defaultBrandId.mockResolvedValue("brand-1");
  svc.loadBrand.mockResolvedValue(brand);
  svc.loadSettings.mockResolvedValue({ budget_daily_usd: 5, budget_monthly_usd: 50, model_routes: {} });
  svc.loadQueriesForRun.mockResolvedValue([
    { id: "q1", cluster_id: "A", cluster_name: "Founder dependency", priority: "high", kind: "audience_language", query: "business stops when I'm away", platforms: ["reddit"] },
  ]);
  svc.loadCompetitorsForRun.mockResolvedValue([
    { id: "c1", name: "Creator", platform: "linkedin", profile_url: "https://www.linkedin.com/in/creator", relationship: "craft_benchmark" },
  ]);
  svc.beginStep.mockImplementation(async (_db: unknown, _job: unknown, step: { name: string }) => ({
    step: { id: `step-${step.name}`, status: "running", input_hash: "h", output: null, attempt: 1 },
    reusable: false,
  }));
  svc.upsertSources.mockImplementation(async (_db, _u, _b, _j, rows: Array<{ content_hash: string }>) => {
    const ids = new Map<string, string>();
    let inserted = 0;
    for (const r of rows) {
      const existing = [...store.values()].find((s) => s.hash === r.content_hash);
      if (existing) ids.set(r.content_hash, existing.id);
      else {
        const id = `src-${store.size + 1}`;
        store.set(id, { id, hash: r.content_hash, row: r as Record<string, unknown>, labels: {} });
        ids.set(r.content_hash, id);
        inserted++;
      }
    }
    return { idsByHash: ids, inserted };
  });
  svc.loadSources.mockImplementation(async (_db, _u, ids: string[]) =>
    ids
      .map((id) => store.get(id))
      .filter(Boolean)
      .map((s) => ({
        id: s!.id,
        platform: s!.row.platform,
        source_url: s!.row.source_url,
        author: s!.row.author,
        content_text: s!.row.content_text,
        metrics: s!.row.metrics,
        labels: s!.labels,
        competitor_id: s!.row.competitor_id,
        query_id: s!.row.query_id,
      })),
  );
  svc.updateSource.mockImplementation(async (_db, _u, id: string, patch: { labels?: Record<string, unknown> }) => {
    if (patch.labels) store.get(id)!.labels = patch.labels;
  });
  svc.recentCompetitorSourceIds.mockResolvedValue([]);
  svc.insertResearchReport.mockResolvedValue("report-1");
  svc.insertResearchIdeas.mockResolvedValue(["idea-1"]);
  svc.sumSpend.mockResolvedValue(0.04);
});

const deps = (c: UsageController, client = fakeClient()) => ({
  db: {} as never,
  controller: c,
  logger: silent,
  scrapeCreators: () => client as never,
});

describe("research_sweep pipeline", () => {
  it("collects, labels with the cheap route, finds the outlier gap and creates an evidence-backed idea", async () => {
    const c = controller();
    const client = fakeClient();
    await runResearchSweep(deps(c, client), "job-1", { finalAttempt: false });

    expect(client.search).toHaveBeenCalledWith("reddit", "business stops when I'm away");
    expect(svc.insertUsage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ provider: "scrapecreators", units: 2, unit_type: "credit" }));
    expect(c.generate.mock.calls.map((call) => call[0].task)).toEqual(["research_labeling", "gap_synthesis"]);

    const report = svc.insertResearchReport.mock.calls[0]![2];
    expect(report.findings.outliers[0]).toMatchObject({ topic: "founder dependency", tier: "huge", baseline_kind: "author" });
    expect(report.findings.gaps[0]).toMatchObject({ topic: "founder dependency", competitor_coverage: 0 });
    expect(report.findings.notes.join(" ")).toMatch(/LinkedIn returned no posts for Creator/);

    const ideas = svc.insertResearchIdeas.mock.calls[0]![4];
    expect(ideas).toHaveLength(1);
    // Only refs the pipeline issued become evidence; the invented e99 is dropped.
    expect(ideas[0].metadata.research.evidence).toHaveLength(1);
    expect(ideas[0].metadata.research.evidence[0]).toMatchObject({ source_id: "src-1", url: expect.stringContaining("/comments/1") });
    expect(svc.updateReportFindings).toHaveBeenCalledWith(expect.anything(), USER, "report-1", expect.objectContaining({ idea_ids: ["idea-1"] }));
    expect(svc.updateJob).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ status: "completed", actual_cost: 0.04 }));
  });

  it("does not re-label sources that already have labels", async () => {
    const c = controller();
    await runResearchSweep(deps(c), "job-1", { finalAttempt: false });
    c.generate.mockClear();
    svc.insertResearchReport.mockClear();
    await runResearchSweep(deps(c), "job-1", { finalAttempt: false });
    expect(c.generate.mock.calls.map((call) => call[0].task)).toEqual(["gap_synthesis"]);
  });

  it("stops without retry when the ScrapeCreators key is rejected", async () => {
    const client = fakeClient({ fail: new ScrapeCreatorsError("ScrapeCreators rejected the API key.", 401, false) });
    await expect(runResearchSweep(deps(controller(), client), "job-1", { finalAttempt: false })).rejects.toBeInstanceOf(NonRetryableJobError);
    expect(svc.updateJob).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ status: "failed" }));
  });

  it("fails clearly when no keywords are enabled", async () => {
    svc.loadQueriesForRun.mockResolvedValue([]);
    await expect(runResearchSweep(deps(controller()), "job-1", { finalAttempt: false })).rejects.toThrow(/No research keywords/);
  });

  it("rejects a job of another type", async () => {
    svc.loadJob.mockResolvedValue({ id: "job-1", user_id: USER, job_type: "analyze_idea", status: "queued", input: {} });
    await expect(runResearchSweep(deps(controller()), "job-1", { finalAttempt: false })).rejects.toBeInstanceOf(NonRetryableJobError);
  });
});
