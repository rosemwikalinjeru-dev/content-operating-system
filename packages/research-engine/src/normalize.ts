import { createHash } from "node:crypto";

/**
 * Normalisation of ScrapeCreators responses into one shape.
 *
 * The API returns platform-specific JSON. Field names were not verifiable from the build
 * environment, so extraction is tolerant: it searches for the first array of objects and reads
 * each field from a list of known candidates (including nested ones). Every item records which
 * raw keys it had, so a mismatch can be diagnosed from stored evidence or the probe endpoint.
 */

export type ResearchPlatform = "reddit" | "youtube" | "tiktok" | "threads" | "instagram" | "x" | "linkedin";

export interface ResearchItem {
  platform: ResearchPlatform;
  externalId: string | null;
  url: string | null;
  text: string;
  author: string | null;
  publishedAt: string | null;
  metrics: { views: number | null; likes: number | null; comments: number | null; shares: number | null };
  /** Raw top-level keys of the item, for diagnosing field mismatches. */
  rawKeys: string[];
}

type Json = unknown;

const ARRAY_KEYS = ["posts", "videos", "items", "results", "data", "tweets", "comments", "aweme_list", "search_item_list", "contents", "children", "activity", "recentPosts"];

/** Find the main list of objects in a response (breadth-first, preferring known keys). */
export function findItems(payload: Json, depth = 0): Record<string, unknown>[] {
  if (depth > 4 || payload === null || typeof payload !== "object") return [];
  if (Array.isArray(payload)) {
    const objects = payload.filter((x): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x));
    // Reddit wraps items as { kind, data: {...} }.
    if (objects.length && objects.every((o) => "data" in o && typeof o.data === "object" && "kind" in o)) {
      return objects.map((o) => o.data as Record<string, unknown>);
    }
    return objects;
  }
  const obj = payload as Record<string, unknown>;
  for (const key of ARRAY_KEYS) {
    const v = obj[key];
    if (Array.isArray(v) && v.length && typeof v[0] === "object") return findItems(v, depth + 1);
  }
  for (const key of ARRAY_KEYS) {
    const v = obj[key];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = findItems(v, depth + 1);
      if (inner.length) return inner;
    }
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v) && v.length && typeof v[0] === "object") return findItems(v, depth + 1);
  }
  // Last resort: search inside wrappers with unfamiliar names (e.g. { payload: { results: [] } }).
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = findItems(v, depth + 1);
      if (inner.length) return inner;
    }
  }
  return [];
}

function get(obj: Record<string, unknown>, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function first(obj: Record<string, unknown>, paths: string[]): unknown {
  for (const p of paths) {
    const v = get(obj, p);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

/** Parse 1234, "1,234", "1.2K", "3.4M", "12 views" → number. */
export function parseCount(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const m = v.replace(/,/g, "").trim().match(/^(\d+(?:\.\d+)?)\s*([kmb])?/i);
  if (!m) return null;
  const n = Number(m[1]);
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? "").toLowerCase() as "k" | "m" | "b"] ?? 1;
  return Math.round(n * mult);
}

/** Unix seconds, unix ms, or a date string → ISO string. */
export function parseDate(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === "string") {
    if (/^\d{9,13}$/.test(v)) return parseDate(Number(v));
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

const FIELDS = {
  id: ["id", "aweme_id", "video_id", "videoId", "post_id", "rest_id", "urn", "name"],
  url: ["url", "permalink", "link", "share_url", "shareUrl", "videoUrl", "post_url", "postUrl"],
  text: ["full_text", "text", "title", "caption", "desc", "description", "selftext", "body", "content", "commentary", "snippet"],
  author: [
    "author.name", "author.username", "author.handle", "author.unique_id", "author.uniqueId", "author.screen_name",
    "author", "user.screen_name", "user.username", "owner.username", "channel.title", "channel.name",
    "author_name", "authorName", "subreddit_name_prefixed", "username",
  ],
  published: ["created_utc", "create_time", "createTime", "published_at", "publishedAt", "publishDate", "publishedTime", "created_at", "createdAt", "taken_at", "timestamp", "date", "postedAt"],
  views: ["view_count", "viewCount", "views", "play_count", "playCount", "statistics.play_count", "statistics.viewCount", "stats.playCount", "video_view_count"],
  likes: ["like_count", "likeCount", "likes", "digg_count", "favorite_count", "ups", "score", "statistics.digg_count", "statistics.likeCount", "stats.diggCount", "reactions", "numLikes", "reaction_count"],
  comments: ["num_comments", "comment_count", "commentCount", "comments_count", "reply_count", "statistics.comment_count", "statistics.commentCount", "stats.commentCount", "numComments"],
  shares: ["share_count", "shareCount", "shares", "retweet_count", "repost_count", "reposts", "statistics.share_count", "stats.shareCount", "numShares"],
} as const;

export function normalizeItem(platform: ResearchPlatform, raw: Record<string, unknown>): ResearchItem {
  let url = str(first(raw, [...FIELDS.url]));
  if (url && platform === "reddit" && url.startsWith("/")) url = `https://www.reddit.com${url}`;
  const title = str(raw.title);
  const body = str(first(raw, ["selftext", "body", "description", "desc", "caption", "text", "full_text", "content", "commentary"]));
  const text = [title, body && body !== title ? body : null].filter(Boolean).join("\n\n") || str(first(raw, [...FIELDS.text])) || "";
  const authorRaw = first(raw, [...FIELDS.author]);
  return {
    platform,
    externalId: str(first(raw, [...FIELDS.id])),
    url,
    text: text.slice(0, 5000),
    author: typeof authorRaw === "object" ? null : str(authorRaw),
    publishedAt: parseDate(first(raw, [...FIELDS.published])),
    metrics: {
      views: parseCount(first(raw, [...FIELDS.views])),
      likes: parseCount(first(raw, [...FIELDS.likes])),
      comments: parseCount(first(raw, [...FIELDS.comments])),
      shares: parseCount(first(raw, [...FIELDS.shares])),
    },
    rawKeys: Object.keys(raw).slice(0, 40),
  };
}

export function normalizeResponse(platform: ResearchPlatform, payload: Json): ResearchItem[] {
  return findItems(payload)
    .map((raw) => normalizeItem(platform, raw))
    .filter((i) => i.text.length > 0 || i.url);
}

/** Stable identity for de-duplication: platform + URL, else platform + text. */
export function contentHash(item: Pick<ResearchItem, "platform" | "url" | "text">): string {
  const key = item.url ? `${item.platform}|${item.url.replace(/[?#].*$/, "")}` : `${item.platform}|${item.text.trim().toLowerCase()}`;
  return createHash("sha256").update(key).digest("hex");
}

/** Shape of a payload for the probe: key paths only, never values. */
export function describeShape(payload: Json, depth = 0, prefix = ""): string[] {
  if (depth > 3 || payload === null || typeof payload !== "object") return [];
  if (Array.isArray(payload)) {
    return payload.length && typeof payload[0] === "object" ? [`${prefix}[] (${payload.length} items)`, ...describeShape(payload[0], depth + 1, `${prefix}[0]`)] : [`${prefix}[]`];
  }
  return Object.entries(payload as Record<string, unknown>).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object") return describeShape(v, depth + 1, path);
    return [`${path}: ${typeof v}`];
  }).slice(0, 120);
}
