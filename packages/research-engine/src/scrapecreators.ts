import { normalizeResponse, type ResearchItem, type ResearchPlatform } from "./normalize";

/**
 * ScrapeCreators REST client (https://api.scrapecreators.com, `x-api-key` header, GET only).
 * Endpoints from the MIT-licensed ScrapeCreators skills. One credit per request for every
 * endpoint used here. The key is a server-side secret (SCRAPECREATORS_API_KEY).
 */

export const SCRAPECREATORS_BASE = "https://api.scrapecreators.com";

export class ScrapeCreatorsError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ScrapeCreatorsError";
  }
}

/** Keyword search endpoints by platform. */
export const SEARCH_ENDPOINTS: Partial<Record<ResearchPlatform, { path: string; param: string }>> = {
  reddit: { path: "/v1/reddit/search", param: "query" },
  youtube: { path: "/v1/youtube/search", param: "query" },
  tiktok: { path: "/v1/tiktok/search/keyword", param: "query" },
  threads: { path: "/v1/threads/search", param: "query" },
  instagram: { path: "/v2/instagram/reels/search", param: "query" },
};

/** Creator feed endpoints by platform. LinkedIn individuals have no feed; the profile is tried. */
export const FEED_ENDPOINTS: Partial<Record<ResearchPlatform, { path: string; param: "handle" | "url" }>> = {
  youtube: { path: "/v1/youtube/channel/videos", param: "handle" },
  tiktok: { path: "/v3/tiktok/profile/videos", param: "handle" },
  instagram: { path: "/v2/instagram/user/posts", param: "handle" },
  x: { path: "/v1/twitter/user/tweets", param: "handle" },
  threads: { path: "/v1/threads/user/posts", param: "handle" },
  linkedin: { path: "/v1/linkedin/profile", param: "url" },
};

export const COMMENT_ENDPOINTS: Partial<Record<ResearchPlatform, string>> = {
  reddit: "/v1/reddit/post/comments",
  youtube: "/v1/youtube/video/comments",
  tiktok: "/v1/tiktok/video/comments",
  instagram: "/v2/instagram/post/comments",
};

export interface FetchResult {
  payload: unknown;
  items: ResearchItem[];
  credits: number;
}

export interface ScrapeCreatorsOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class ScrapeCreatorsClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Credits spent by this client instance (1 per successful or failed-billable request). */
  creditsUsed = 0;

  constructor(private readonly opts: ScrapeCreatorsOptions) {
    if (!opts.apiKey) throw new ScrapeCreatorsError("SCRAPECREATORS_API_KEY is not set.", null, false);
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 25_000;
    this.retries = opts.retries ?? 2;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Raw GET with timeout and retry on 429/5xx/network errors. */
  async get(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(path, SCRAPECREATORS_BASE);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("trim", "true");

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url, { headers: { "x-api-key": this.opts.apiKey }, signal: controller.signal });
        if (res.ok) {
          this.creditsUsed += 1;
          return await res.json();
        }
        const retryable = res.status === 429 || res.status >= 500;
        if (res.status === 401 || res.status === 403) {
          throw new ScrapeCreatorsError("ScrapeCreators rejected the API key. Check SCRAPECREATORS_API_KEY.", res.status, false);
        }
        if (res.status === 402) throw new ScrapeCreatorsError("ScrapeCreators credits are exhausted.", 402, false);
        if (!retryable || attempt >= this.retries) {
          throw new ScrapeCreatorsError(`ScrapeCreators request failed (${res.status}) for ${path}.`, res.status, retryable);
        }
      } catch (err) {
        if (err instanceof ScrapeCreatorsError) throw err;
        if (attempt >= this.retries) throw new ScrapeCreatorsError(`Could not reach ScrapeCreators for ${path}.`, null, true);
      } finally {
        clearTimeout(timer);
      }
      await this.sleep(1_000 * 2 ** attempt);
    }
  }

  async search(platform: ResearchPlatform, query: string): Promise<FetchResult> {
    const ep = SEARCH_ENDPOINTS[platform];
    if (!ep) throw new ScrapeCreatorsError(`Search is not available for ${platform}.`, null, false);
    const before = this.creditsUsed;
    const payload = await this.get(ep.path, { [ep.param]: query });
    return { payload, items: normalizeResponse(platform, payload), credits: this.creditsUsed - before };
  }

  async feed(platform: ResearchPlatform, handleOrUrl: string): Promise<FetchResult> {
    const ep = FEED_ENDPOINTS[platform];
    if (!ep) throw new ScrapeCreatorsError(`Creator feeds are not available for ${platform}.`, null, false);
    const value = ep.param === "handle" ? toHandle(handleOrUrl) : handleOrUrl;
    const before = this.creditsUsed;
    const payload = await this.get(ep.path, { [ep.param]: value });
    return { payload, items: normalizeResponse(platform, payload), credits: this.creditsUsed - before };
  }

  async comments(platform: ResearchPlatform, postUrl: string): Promise<FetchResult> {
    const path = COMMENT_ENDPOINTS[platform];
    if (!path) throw new ScrapeCreatorsError(`Comments are not available for ${platform}.`, null, false);
    const before = this.creditsUsed;
    const payload = await this.get(path, { url: postUrl });
    return { payload, items: normalizeResponse(platform, payload), credits: this.creditsUsed - before };
  }
}

/** "https://www.youtube.com/@starterstory" or "@starterstory" → "starterstory". */
export function toHandle(handleOrUrl: string): string {
  const trimmed = handleOrUrl.trim();
  try {
    const u = new URL(trimmed);
    const seg = u.pathname.split("/").filter(Boolean).pop() ?? "";
    return seg.replace(/^@/, "");
  } catch {
    return trimmed.replace(/^@/, "");
  }
}

/** Map a profile URL to a platform, if recognisable. */
export function platformFromUrl(url: string): ResearchPlatform | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.endsWith("linkedin.com")) return "linkedin";
    if (host.endsWith("youtube.com") || host === "youtu.be") return "youtube";
    if (host.endsWith("tiktok.com")) return "tiktok";
    if (host.endsWith("instagram.com")) return "instagram";
    if (host === "x.com" || host.endsWith("twitter.com")) return "x";
    if (host.endsWith("threads.net") || host.endsWith("threads.com")) return "threads";
    if (host.endsWith("reddit.com")) return "reddit";
  } catch {
    return null;
  }
  return null;
}
