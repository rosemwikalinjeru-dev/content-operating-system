import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { engagement, median, scoreItems, tier, type AnalyzableItem } from "./analysis";
import { normaliseTopic, scoreGaps, type LabelledPost } from "./gaps";
import { contentHash, describeShape, findItems, normalizeResponse, parseCount, parseDate } from "./normalize";
import { platformFromUrl, ScrapeCreatorsClient, ScrapeCreatorsError, toHandle } from "./scrapecreators";
import { STARTER_KEYWORDS, STARTER_WATCHLIST } from "./starter-data";

describe("normalisation", () => {
  it("parses counts and dates in their common forms", () => {
    expect(parseCount(1234)).toBe(1234);
    expect(parseCount("1,234")).toBe(1234);
    expect(parseCount("1.2K")).toBe(1200);
    expect(parseCount("3.4M views")).toBe(3_400_000);
    expect(parseCount("n/a")).toBeNull();
    expect(parseDate(1_700_000_000)).toBe("2023-11-14T22:13:20.000Z");
    expect(parseDate(1_700_000_000_000)).toBe("2023-11-14T22:13:20.000Z");
    expect(parseDate("2026-11-01T10:00:00Z")).toBe("2026-11-01T10:00:00.000Z");
    expect(parseDate("not a date")).toBeNull();
  });

  it("reads Reddit-style listings (kind/data wrappers, relative permalinks, score)", () => {
    const payload = {
      posts: [
        { kind: "t3", data: { id: "a1", title: "My business can't run without me", selftext: "Every decision goes through me.", permalink: "/r/smallbusiness/comments/a1/x/", author: "owner42", score: 812, num_comments: 140, created_utc: 1_764_000_000 } },
      ],
    };
    const [item] = normalizeResponse("reddit", payload);
    expect(item).toMatchObject({
      externalId: "a1",
      url: "https://www.reddit.com/r/smallbusiness/comments/a1/x/",
      author: "owner42",
      metrics: { likes: 812, comments: 140 },
    });
    expect(item!.text).toContain("can't run without me");
    expect(item!.text).toContain("Every decision goes through me.");
  });

  it("reads YouTube/TikTok-style items with nested authors and statistics", () => {
    const yt = { videos: [{ id: "v1", title: "Outgrew spreadsheets", url: "https://youtube.com/watch?v=v1", channel: { title: "Ops Lab" }, viewCountInt: 9, viewCount: "12K", publishedTime: "2026-10-01T00:00:00Z" }] };
    expect(normalizeResponse("youtube", yt)[0]).toMatchObject({ author: "Ops Lab", metrics: { views: 12_000 } });
    const tt = { aweme_list: [{ aweme_id: "t1", desc: "hire or automate?", author: { unique_id: "opsqueen" }, statistics: { play_count: 50_000, digg_count: 2_000, comment_count: 80, share_count: 30 }, create_time: 1_764_000_000 }] };
    expect(normalizeResponse("tiktok", tt)[0]).toMatchObject({ externalId: "t1", author: "opsqueen", metrics: { views: 50_000, likes: 2_000, comments: 80, shares: 30 } });
  });

  it("reads X-style tweets", () => {
    const x = { tweets: [{ rest_id: "x1", full_text: "Your tools don't talk to each other.", favorite_count: 300, retweet_count: 40, reply_count: 22, created_at: "Wed Nov 12 10:00:00 +0000 2026", user: { screen_name: "founderfred" } }] };
    expect(normalizeResponse("x", x)[0]).toMatchObject({ externalId: "x1", author: "founderfred", metrics: { likes: 300, shares: 40, comments: 22 } });
  });

  it("finds item arrays in unexpected places and records raw keys", () => {
    const odd = { meta: { ok: true }, payload: { results: [{ caption: "a", likes: 1 }] } };
    const items = findItems(odd);
    expect(items).toHaveLength(1);
    expect(normalizeResponse("instagram", odd)[0]!.rawKeys).toEqual(["caption", "likes"]);
  });

  it("de-duplicates by platform and URL, ignoring query strings", () => {
    const a = contentHash({ platform: "reddit", url: "https://reddit.com/r/x/1?utm=a", text: "" });
    const b = contentHash({ platform: "reddit", url: "https://reddit.com/r/x/1", text: "different" });
    expect(a).toBe(b);
    expect(contentHash({ platform: "youtube", url: "https://reddit.com/r/x/1", text: "" })).not.toBe(a);
  });

  it("describes response shape without values (probe)", () => {
    const shape = describeShape({ posts: [{ id: "secret-id", score: 5, author: { name: "Jane" } }], cursor: "abc" });
    expect(shape).toContain("posts[] (1 items)");
    expect(shape).toContain("posts[0].id: string");
    expect(shape).toContain("posts[0].author.name: string");
    expect(shape.join(" ")).not.toContain("secret-id");
    expect(shape.join(" ")).not.toContain("Jane");
  });
});

describe("outlier analysis", () => {
  const item = (i: number, author: string | null, value: number, platform: "reddit" | "youtube" = "reddit"): AnalyzableItem => ({
    platform,
    externalId: String(i),
    url: `https://x/${i}`,
    text: `post ${i}`,
    author,
    publishedAt: null,
    metrics: platform === "youtube" ? { views: value, likes: null, comments: null, shares: null } : { views: null, likes: value, comments: 0, shares: 0 },
    rawKeys: [],
    group: "q1",
  });

  it("uses views for video platforms and weighted interactions for text platforms", () => {
    expect(engagement({ platform: "youtube", metrics: { views: 1000, likes: 50, comments: 5, shares: 1 } })).toBe(1000);
    expect(engagement({ platform: "reddit", metrics: { views: null, likes: 10, comments: 5, shares: 2 } })).toBe(10 + 10 + 6);
    expect(engagement({ platform: "reddit", metrics: { views: null, likes: null, comments: null, shares: null } })).toBeNull();
  });

  it("medians and tiers", () => {
    expect(median([1, 100, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect([tier(6), tier(2), tier(1.6), tier(1.2), tier(null)]).toEqual(["huge", "strong", "mild", "none", "none"]);
  });

  it("prefers the author's own baseline, so a big account's normal post is not an outlier", () => {
    const big = [1, 2, 3, 4, 5].map((i) => item(i, "big", 10_000));
    const bigHit = item(6, "big", 60_000);
    const small = [7, 8, 9, 10, 11].map((i) => item(i, "small", 10));
    const smallHit = item(12, "small", 80);
    const scored = scoreItems([...big, bigHit, ...small, smallHit]);
    const byId = Object.fromEntries(scored.map((s) => [s.item.externalId, s]));
    expect(byId["1"]!.tier).toBe("none");
    expect(byId["6"]).toMatchObject({ baselineKind: "author", tier: "huge" });
    expect(byId["12"]).toMatchObject({ baselineKind: "author", tier: "huge" });
  });

  it("falls back to the query baseline, then to none, and flags low confidence", () => {
    const query = Array.from({ length: 8 }, (_, i) => item(i, `a${i}`, i === 7 ? 500 : 50));
    const scored = scoreItems(query);
    expect(scored[7]).toMatchObject({ baselineKind: "query", tier: "huge", confidence: "low" });
    const few = scoreItems([item(1, null, 5), item(2, null, 50)]);
    expect(few.every((s) => s.baselineKind === "none" && s.tier === "none")).toBe(true);
  });

  it("never mixes platforms in one baseline", () => {
    const reddit = Array.from({ length: 8 }, (_, i) => item(i, `r${i}`, 10));
    const yt = Array.from({ length: 8 }, (_, i) => item(100 + i, `y${i}`, 100_000, "youtube"));
    const scored = scoreItems([...reddit, ...yt]);
    expect(scored.every((s) => s.tier === "none")).toBe(true);
  });
});

describe("gap scoring", () => {
  const post = (over: Partial<LabelledPost>): LabelledPost => ({
    sourceId: Math.random().toString(36).slice(2),
    topic: "founder dependency",
    clusterId: "E",
    clusterPriority: "high",
    lift: 4,
    tier: "strong",
    isQuestion: false,
    ownerAudience: true,
    brandFit: 0.9,
    fromCompetitor: false,
    ...over,
  });

  it("ranks an under-covered, on-brand niche outlier above a topic competitors already cover", () => {
    const posts = [
      post({ topic: "Founder dependency" }),
      post({ topic: "founder dependency", isQuestion: true }),
      post({ topic: "missed calls", clusterId: "F", clusterPriority: "medium" }),
      ...Array.from({ length: 5 }, () => post({ topic: "missed calls", fromCompetitor: true })),
      post({ topic: "other", fromCompetitor: true }),
    ];
    const gaps = scoreGaps(posts, { minScore: 0 });
    expect(gaps[0]!.topic).toBe("founder dependency");
    const missed = gaps.find((g) => g.topic === "missed calls");
    expect(missed === undefined || missed.score < gaps[0]!.score).toBe(true);
    expect(gaps[0]!.questionCount).toBe(1);
    expect(gaps[0]!.evidenceIds.length).toBeGreaterThan(0);
  });

  it("excludes saturation-benchmark topics and off-brand or builder-only topics rank lower", () => {
    const gaps = scoreGaps(
      [
        post({ topic: "booking automation", clusterPriority: "benchmark" }),
        post({ topic: "n8n nodes", brandFit: 0.1, ownerAudience: false }),
        post({ topic: "manual reporting" }),
      ],
      { minScore: 0 },
    );
    expect(gaps.map((g) => g.topic)).not.toContain("booking automation");
    expect(gaps[0]!.topic).toBe("manual reporting");
  });

  it("ignores topics with neither outliers nor questions", () => {
    expect(scoreGaps([post({ tier: "none", lift: 1 })], { minScore: 0 })).toEqual([]);
    expect(normaliseTopic("  Founder-Dependency!! ")).toBe("founder-dependency");
  });
});

describe("ScrapeCreators client", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it("sends the key header, trims payloads, normalises results and counts credits", async () => {
    const fetchImpl = vi.fn(async () => ok({ posts: [{ kind: "t3", data: { id: "1", title: "t", score: 3, author: "a", permalink: "/r/x/1" } }] }));
    const client = new ScrapeCreatorsClient({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await client.search("reddit", "can't take a holiday");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.scrapecreators.com/v1/reddit/search?query=can%27t+take+a+holiday&trim=true");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("k");
    expect(res.items).toHaveLength(1);
    expect(res.credits).toBe(1);
  });

  it("retries 429 and 5xx, but not auth errors or exhausted credits", async () => {
    const sleep = vi.fn(async () => {});
    const flaky = vi.fn().mockResolvedValueOnce(new Response("", { status: 429 })).mockResolvedValueOnce(ok({ videos: [] }));
    const c1 = new ScrapeCreatorsClient({ apiKey: "k", fetchImpl: flaky as unknown as typeof fetch, sleep });
    await c1.search("youtube", "q");
    expect(flaky).toHaveBeenCalledTimes(2);

    const auth = vi.fn(async () => new Response("", { status: 401 }));
    const c2 = new ScrapeCreatorsClient({ apiKey: "k", fetchImpl: auth as unknown as typeof fetch, sleep });
    await expect(c2.search("youtube", "q")).rejects.toMatchObject({ status: 401, retryable: false });
    expect(auth).toHaveBeenCalledTimes(1);

    const broke = vi.fn(async () => new Response("", { status: 402 }));
    const c3 = new ScrapeCreatorsClient({ apiKey: "k", fetchImpl: broke as unknown as typeof fetch, sleep });
    await expect(c3.search("youtube", "q")).rejects.toThrow("credits are exhausted");
  });

  it("refuses to run without a key and rejects unsupported platforms", async () => {
    expect(() => new ScrapeCreatorsClient({ apiKey: "" })).toThrow(ScrapeCreatorsError);
    const c = new ScrapeCreatorsClient({ apiKey: "k", fetchImpl: vi.fn() as unknown as typeof fetch });
    await expect(c.search("linkedin", "q")).rejects.toThrow("not available");
  });

  it("maps URLs to platforms and handles", () => {
    expect(platformFromUrl("https://www.linkedin.com/in/justinwelsh/")).toBe("linkedin");
    expect(platformFromUrl("https://x.com/hormozi")).toBe("x");
    expect(platformFromUrl("not a url")).toBeNull();
    expect(toHandle("https://www.youtube.com/@starterstory")).toBe("starterstory");
    expect(toHandle("@opsqueen")).toBe("opsqueen");
  });
});

describe("starter data", () => {
  it("matches the docs JSON files exactly", () => {
    const root = resolve(import.meta.dirname, "../../../docs/research");
    expect(STARTER_KEYWORDS).toEqual(JSON.parse(readFileSync(resolve(root, "research-keywords.json"), "utf8")));
    expect(STARTER_WATCHLIST).toEqual(JSON.parse(readFileSync(resolve(root, "watchlist.json"), "utf8")));
  });
});
