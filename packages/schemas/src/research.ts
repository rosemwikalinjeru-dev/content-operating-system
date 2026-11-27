import { z } from "zod";
import { PaginationQuery, Uuid } from "./common";
import { FunnelStage, HookPattern } from "./intelligence";

// ---------------------------------------------------------------------------
// Model output schemas (structured outputs: plain types only)
// ---------------------------------------------------------------------------

export const CLUSTER_IDS = ["A", "B", "C", "D", "E", "F"] as const;

export const ResearchLabels = z.object({
  items: z.array(
    z.object({
      ref: z.string().describe("The ref of the post being labelled, exactly as given."),
      topic: z.string().describe("The business problem in 2-5 plain words, e.g. 'founder dependency', 'chasing invoices'. Not the product or tool."),
      cluster_id: z.enum([...CLUSTER_IDS, "none"]),
      hook_pattern: z.enum([...HookPatternValues(), "none"]),
      is_question: z.boolean().describe("True if the post asks for help or advice with a problem."),
      owner_audience: z.boolean().describe("True if written by or for business owners/operators, false if for automation builders or developers."),
      brand_fit: z.number().describe("0 to 1: how well the problem fits the brand's positioning and audience."),
    }),
  ),
});
export type ResearchLabels = z.infer<typeof ResearchLabels>;

function HookPatternValues() {
  return HookPattern.options;
}

export const GapIdeas = z.object({
  ideas: z.array(
    z.object({
      gap_topic: z.string().describe("The gap topic this idea addresses, exactly as given."),
      title: z.string().describe("A short working title in the owner's plain voice."),
      specific_moment: z
        .string()
        .describe("One observable moment in a named kind of service business where the problem shows up (who, what they are doing, what goes wrong), drawn from the evidence's language."),
      non_obvious_claim: z
        .string()
        .describe("The owner's position in one sentence: a hidden cause, a cost people miss, or a common belief it contradicts. Not a slogan."),
      generic_version: z.string().describe("The bland version of this idea any automation agency would post — the thing this idea must not become."),
      raw_input: z.string().describe("The idea as the owner would jot it down: the moment, the claim, why it matters. No invented numbers or stories; [placeholders] where her own example is needed."),
      angle: z.string(),
      funnel_stage: FunnelStage,
      why_gap: z.string().describe("Why this is a gap: what the audience is doing or asking, and what competitors are not covering. Cite only the evidence given."),
      evidence_refs: z.array(z.string()).describe("Refs of the evidence posts that support the idea."),
    }),
  ),
});
export type GapIdeas = z.infer<typeof GapIdeas>;

/** Independent genericity screen, using the Idea Analyst's test, before ideas reach the Inbox. */
export const IdeaScreen = z.object({
  results: z.array(
    z.object({
      ref: z.string(),
      is_generic: z.boolean(),
      reason: z.string().describe("One sentence: what makes it specific to the owner, or which generic idea it collapses into."),
    }),
  ),
});
export type IdeaScreen = z.infer<typeof IdeaScreen>;

// ---------------------------------------------------------------------------
// API inputs
// ---------------------------------------------------------------------------

export const RESEARCH_PLATFORMS = ["reddit", "youtube", "tiktok", "threads", "instagram", "x", "linkedin"] as const;
export const ResearchPlatformSchema = z.enum(RESEARCH_PLATFORMS);
export const SEARCHABLE_PLATFORMS = ["reddit", "youtube", "tiktok", "threads", "instagram"] as const;

export const ResearchQueryCreate = z.object({
  cluster_id: z.string().trim().min(1).max(40),
  cluster_name: z.string().trim().min(1).max(120),
  priority: z.enum(["high", "medium", "benchmark"]).default("medium"),
  kind: z.enum(["audience_language", "concept", "saturation"]).default("audience_language"),
  query: z.string().trim().min(2).max(200),
  platforms: z.array(z.enum(SEARCHABLE_PLATFORMS)).min(1).max(5).default(["reddit", "youtube"]),
});
export type ResearchQueryCreate = z.infer<typeof ResearchQueryCreate>;

export const ResearchQueryUpdate = z
  .object({
    enabled: z.boolean(),
    priority: z.enum(["high", "medium", "benchmark"]),
    platforms: z.array(z.enum(SEARCHABLE_PLATFORMS)).min(1).max(5),
    query: z.string().trim().min(2).max(200),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "At least one field must be provided");

export const COMPETITOR_RELATIONSHIPS = ["direct_competitor", "positioning_benchmark", "craft_benchmark"] as const;

export const CompetitorCreate = z.object({
  name: z.string().trim().min(1).max(120),
  profile_url: z.url().max(500),
  relationship: z.enum(COMPETITOR_RELATIONSHIPS).default("direct_competitor"),
  priority: z.number().int().min(1).max(99).nullable().optional(),
  study_focus: z.string().trim().max(500).optional(),
});
export type CompetitorCreate = z.infer<typeof CompetitorCreate>;

export const CompetitorUpdate = z
  .object({
    enabled: z.boolean(),
    relationship: z.enum(COMPETITOR_RELATIONSHIPS),
    priority: z.number().int().min(1).max(99).nullable(),
    study_focus: z.string().trim().max(500),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "At least one field must be provided");

/** Owner-pasted posts (e.g. LinkedIn individuals, which have no API feed). */
export const ManualSourcesImport = z.object({
  competitor_id: Uuid.optional(),
  posts: z
    .array(
      z.object({
        text: z.string().trim().min(10).max(5000),
        url: z.url().max(500).optional(),
        author: z.string().trim().max(120).optional(),
        published_at: z.iso.date().optional(),
        likes: z.number().int().min(0).optional(),
        comments: z.number().int().min(0).optional(),
        shares: z.number().int().min(0).optional(),
      }),
    )
    .min(1)
    .max(50),
});
export type ManualSourcesImport = z.infer<typeof ManualSourcesImport>;

export const ResearchRunRequest = z.object({
  cluster_ids: z.array(z.string().min(1).max(40)).max(10).optional(),
  include_competitors: z.boolean().default(true),
  max_queries: z.number().int().min(1).max(10).default(6),
  max_credits: z.number().int().min(5).max(100).default(30),
});
export type ResearchRunRequest = z.infer<typeof ResearchRunRequest>;

export const ResearchScheduleUpdate = z.object({ enabled: z.boolean() });

export const ResearchListQuery = PaginationQuery;

export interface ResearchQueryRow {
  id: string;
  cluster_id: string;
  cluster_name: string;
  priority: "high" | "medium" | "benchmark";
  kind: "audience_language" | "concept" | "saturation";
  query: string;
  platforms: string[];
  enabled: boolean;
  last_run_at: string | null;
}

export interface CompetitorRow {
  id: string;
  name: string;
  platform: string;
  profile_url: string;
  relationship: (typeof COMPETITOR_RELATIONSHIPS)[number];
  priority: number | null;
  study_focus: string | null;
  enabled: boolean;
  last_collected_at: string | null;
}

export interface ResearchFindings {
  stats: { sources: number; new_sources: number; queries: number; competitors: number; credits: number; labelled: number };
  outliers: Array<{
    source_id: string;
    platform: string;
    url: string | null;
    author: string | null;
    excerpt: string;
    topic: string | null;
    lift: number | null;
    tier: string;
    baseline_kind: string;
    confidence: string;
    from_competitor: boolean;
  }>;
  gaps: Array<{
    topic: string;
    cluster_id: string | null;
    score: number;
    outlier_strength: number;
    competitor_coverage: number;
    brand_fit: number;
    question_count: number;
    outlier_count: number;
    evidence_ids: string[];
    /** Observed evidence for display (first five). Older reports may lack it. */
    evidence?: Array<{ source_id: string; platform: string; url: string | null; excerpt: string; lift: number | null }>;
  }>;
  idea_ids: string[];
  /** Candidate ideas the genericity screen rejected (kept out of the Inbox). Older reports lack it. */
  rejected_ideas?: Array<{ title: string; gap_topic: string; reason: string }>;
  notes: string[];
}

/** Owner-only probe of one ScrapeCreators endpoint (1 credit): returns the response shape only. */
export const ResearchProbeRequest = z.object({
  platform: z.enum(RESEARCH_PLATFORMS),
  mode: z.enum(["search", "feed"]),
  value: z.string().trim().min(2).max(500),
});
