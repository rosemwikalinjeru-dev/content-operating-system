import type { ResearchItem, ResearchPlatform } from "./normalize";

/**
 * Outlier analysis (method from the outlier-post-finder skill, MIT):
 *  - engagement per platform (views-first for video platforms, interactions for text-first);
 *  - baseline = MEDIAN of the same author's posts on the same platform (>= 5 posts),
 *    otherwise the median of the same query's results (>= 8 posts), otherwise none;
 *  - lift = engagement / baseline; tiers: huge >= 5x, strong >= 2x, mild >= 1.5x;
 *  - confidence is low when the baseline sample is under 10.
 * Never compares raw numbers across platforms.
 */

const VIDEO_FIRST: ReadonlySet<ResearchPlatform> = new Set(["youtube", "tiktok", "instagram"]);
export const MIN_AUTHOR_SAMPLE = 5;
export const MIN_QUERY_SAMPLE = 8;

export function engagement(item: Pick<ResearchItem, "platform" | "metrics">): number | null {
  const { views, likes, comments, shares } = item.metrics;
  if (VIDEO_FIRST.has(item.platform) && views != null) return views;
  const parts = [likes, comments == null ? null : comments * 2, shares == null ? null : shares * 3].filter((x): x is number => x != null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) : views;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export type OutlierTier = "huge" | "strong" | "mild" | "none";

export function tier(lift: number | null): OutlierTier {
  if (lift == null) return "none";
  if (lift >= 5) return "huge";
  if (lift >= 2) return "strong";
  if (lift >= 1.5) return "mild";
  return "none";
}

export interface AnalyzableItem extends ResearchItem {
  /** Group key for query-relative baselines (e.g. the query id). */
  group: string;
}

export interface ScoredItem<T extends AnalyzableItem = AnalyzableItem> {
  item: T;
  engagement: number | null;
  baseline: number | null;
  baselineKind: "author" | "query" | "none";
  baselineSample: number;
  lift: number | null;
  tier: OutlierTier;
  confidence: "low" | "medium";
}

export function scoreItems<T extends AnalyzableItem>(items: T[]): ScoredItem<T>[] {
  const withEng = items.map((item) => ({ item, eng: engagement(item) }));
  const byAuthor = new Map<string, number[]>();
  const byGroup = new Map<string, number[]>();
  for (const { item, eng } of withEng) {
    if (eng == null) continue;
    if (item.author) {
      const k = `${item.platform}|${item.author.toLowerCase()}`;
      byAuthor.set(k, [...(byAuthor.get(k) ?? []), eng]);
    }
    const g = `${item.platform}|${item.group}`;
    byGroup.set(g, [...(byGroup.get(g) ?? []), eng]);
  }

  return withEng.map(({ item, eng }) => {
    const authorVals = item.author ? byAuthor.get(`${item.platform}|${item.author.toLowerCase()}`) ?? [] : [];
    const groupVals = byGroup.get(`${item.platform}|${item.group}`) ?? [];
    let baseline: number | null = null;
    let baselineKind: ScoredItem["baselineKind"] = "none";
    let sample = 0;
    if (authorVals.length >= MIN_AUTHOR_SAMPLE) {
      baseline = median(authorVals);
      baselineKind = "author";
      sample = authorVals.length;
    } else if (groupVals.length >= MIN_QUERY_SAMPLE) {
      baseline = median(groupVals);
      baselineKind = "query";
      sample = groupVals.length;
    }
    const lift = eng != null && baseline != null && baseline > 0 ? Math.round((eng / baseline) * 100) / 100 : null;
    return {
      item,
      engagement: eng,
      baseline,
      baselineKind,
      baselineSample: sample,
      lift,
      tier: tier(lift),
      confidence: sample >= 10 ? "medium" : "low",
    };
  });
}
