/**
 * Gap scoring: topics that perform in the niche but that tracked competitors rarely cover.
 *
 *   score = outlier strength × (1 − competitor coverage) × brand fit × cluster weight
 *
 * - outlier strength: mean lift of the topic's outlier posts, capped at 10, scaled to 0..1;
 *   unanswered questions add strength (an audience asking is demand).
 * - competitor coverage: share of tracked-competitor posts on the topic (0..1).
 * - brand fit: mean of the labeller's 0..1 fit for the topic's posts.
 * - cluster weight: high 1.3, medium 1.0; saturation-benchmark topics are excluded.
 * - topics mainly discussed by automation builders rather than owners are down-weighted.
 */

export interface LabelledPost {
  sourceId: string;
  topic: string;
  clusterId: string | null;
  clusterPriority: "high" | "medium" | "benchmark" | null;
  lift: number | null;
  tier: "huge" | "strong" | "mild" | "none";
  isQuestion: boolean;
  ownerAudience: boolean;
  brandFit: number;
  fromCompetitor: boolean;
}

export interface TopicGap {
  topic: string;
  clusterId: string | null;
  score: number;
  outlierStrength: number;
  competitorCoverage: number;
  brandFit: number;
  questionCount: number;
  outlierCount: number;
  evidenceIds: string[];
}

const WEIGHT = { high: 1.3, medium: 1, benchmark: 0 } as const;

export function normaliseTopic(topic: string): string {
  return topic.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, " ").trim();
}

export function scoreGaps(posts: LabelledPost[], opts: { minScore?: number; limit?: number } = {}): TopicGap[] {
  const competitorPosts = posts.filter((p) => p.fromCompetitor);
  const niche = posts.filter((p) => !p.fromCompetitor);
  const byTopic = new Map<string, LabelledPost[]>();
  for (const p of niche) {
    const t = normaliseTopic(p.topic);
    if (!t) continue;
    byTopic.set(t, [...(byTopic.get(t) ?? []), p]);
  }

  const gaps: TopicGap[] = [];
  for (const [topic, group] of byTopic) {
    const priority = mostCommon(group.map((p) => p.clusterPriority).filter((x): x is NonNullable<typeof x> => x != null)) ?? "medium";
    const weight = WEIGHT[priority];
    if (weight === 0) continue;

    const outliers = group.filter((p) => p.tier !== "none" && p.lift != null);
    const questions = group.filter((p) => p.isQuestion).length;
    if (!outliers.length && questions === 0) continue;

    const meanLift = outliers.length ? outliers.reduce((s, p) => s + Math.min(p.lift!, 10), 0) / outliers.length : 0;
    const strength = Math.min(1, meanLift / 10 + Math.min(questions, 5) * 0.08);
    const coverage = competitorPosts.length
      ? competitorPosts.filter((p) => normaliseTopic(p.topic) === topic).length / competitorPosts.length
      : 0;
    const fit = group.reduce((s, p) => s + clamp01(p.brandFit), 0) / group.length;
    const ownerShare = group.filter((p) => p.ownerAudience).length / group.length;
    const audienceFactor = 0.5 + 0.5 * ownerShare;

    const score = round(strength * (1 - Math.min(coverage * 3, 1)) * fit * weight * audienceFactor);
    gaps.push({
      topic,
      clusterId: mostCommon(group.map((p) => p.clusterId).filter((x): x is string => x != null)),
      score,
      outlierStrength: round(strength),
      competitorCoverage: round(coverage),
      brandFit: round(fit),
      questionCount: questions,
      outlierCount: outliers.length,
      evidenceIds: [...outliers, ...group.filter((p) => p.isQuestion)].map((p) => p.sourceId).filter((v, i, a) => a.indexOf(v) === i).slice(0, 8),
    });
  }

  return gaps
    .filter((g) => g.score >= (opts.minScore ?? 0.05))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 10);
}

function mostCommon<T>(values: T[]): T | null {
  if (!values.length) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]![0];
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const round = (n: number) => Math.round(n * 1000) / 1000;
