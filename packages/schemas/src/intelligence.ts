import { z } from "zod";
import { PaginationQuery, Uuid } from "./common";

// Output schemas below are sent to the model as JSON Schema (structured outputs), so they use
// plain types only: no transforms, no defaults, no recursion.

// ---------------------------------------------------------------------------
// Hook craft (shared with Phase 2 research labelling)
// ---------------------------------------------------------------------------

/** Hook pattern taxonomy (docs/research/COMPETITOR-WATCHLIST.md). */
export const HOOK_PATTERNS = [
  "specific_scenario",
  "hidden_cost",
  "commercial_insight",
  "strong_opinion",
  "counterintuitive",
  "unexpected_truth",
  "personal_lesson",
  "pain_recognition",
  "question",
] as const;
export const HookPattern = z.enum(HOOK_PATTERNS);
export type HookPattern = z.infer<typeof HookPattern>;

/** How the post is delivered: its shape and pacing. */
export const POST_STRUCTURES = [
  "story_to_lesson",
  "numbered_scenes",
  "contrast",
  "short_list",
  "steps",
  "single_idea",
  "before_after",
] as const;
export const PostStructure = z.enum(POST_STRUCTURES);
export type PostStructure = z.infer<typeof PostStructure>;

/**
 * Content types (funnel stages). Merged from the owner's frameworks, 2026-11-27.
 * Descriptions are given to the agents; the target mix lives in Brand DNA (content_mix).
 */
export const FUNNEL_STAGES = ["growth", "authority", "conversion", "personal"] as const;
export const FunnelStage = z.enum(FUNNEL_STAGES);
export type FunnelStage = z.infer<typeof FunnelStage>;

export const FUNNEL_STAGE_GUIDE: Record<FunnelStage, string> = {
  growth:
    "Top of funnel (TOFU) — the owner's main focus. Gets you discovered by business owners who have never heard of her. Hot takes, industry challenges, everyday operational moments, bold observations. Understandable with no prior context and no jargon; no offer, no pitch; ends with a low-effort action (reply, save, notice something in your own business). Broad enough to attract, sharp enough to stand out.",
  authority:
    "Builds trust. Frameworks, how to solve one specific problem, teardowns, trend breakdowns, case studies (real ones only).",
  conversion:
    "Turns followers into clients. Offers, demos, before/after scenarios (labelled as scenarios unless real), one clear call to action. Never invented results.",
  personal:
    "Makes them remember you. Mistakes, turning points, behind the scenes, a life moment that taught something about the industry. Only the owner's real experiences.",
};

export const Angle = z.object({
  angle: z.string().describe("The angle in one plain sentence."),
  specific_moment: z
    .string()
    .describe("The concrete, observable moment the post is built on: who, when, what happened. Never a concept."),
  hook_pattern: HookPattern,
  sample_hook: z
    .string()
    .describe("One or two short opening lines in the owner's voice. Use [square-bracket placeholders] for any number or detail only the owner knows."),
  structure: PostStructure,
  funnel_stage: FunnelStage,
  why: z.string().describe("Why this angle is specific to this owner and would make a business owner stop."),
  needs_from_owner: z
    .string()
    .nullable()
    .describe("What the owner must supply for the angle to be true (a real moment, number or example), or null if none."),
});
export type Angle = z.infer<typeof Angle>;

// ---------------------------------------------------------------------------
// Idea analysis
// ---------------------------------------------------------------------------

export const IdeaAnalysisOutput = z.object({
  summary: z.string().describe("One or two sentences restating the idea in plain words."),
  core_argument: z.string().describe("The single claim the content would argue."),
  claims: z
    .array(
      z.object({
        text: z.string(),
        type: z.enum(["fact", "opinion", "experience", "assumption"]),
        needs_evidence: z.boolean().describe("True for any factual or numeric claim not backed by verified knowledge."),
      }),
    )
    .describe("Every claim in the idea, classified."),
  missing_information: z.array(z.string()).describe("What the owner must supply before this can be written well."),
  genericity: z.object({
    is_generic: z
      .boolean()
      .describe("True if a generic AI automation agency could publish this idea unchanged (Brand Guidelines §13.3)."),
    reason: z.string(),
    sharpening_questions: z
      .array(z.string())
      .describe("Questions that pull out the owner's specific observation, example or experience."),
  }),
  audience_fit: z.string().describe("Who this is for and why they would care, in the audience's own terms."),
  suggested_angles: z
    .array(Angle)
    .describe("Three to five angles, each with a different hook_pattern and a different specific_moment."),
  related_knowledge_ids: z.array(z.string()).describe("IDs of supplied knowledge entries this idea connects to."),
  recommended_next_step: z.enum(["create_brief", "sharpen_idea", "gather_evidence"]),
});

/**
 * Stored analysis, as read back for display and for brief generation. Analyses saved by
 * Idea Analyst v1 only had { angle, why } per angle, so the newer angle fields are optional here.
 */
export const IdeaAnalysis = IdeaAnalysisOutput.extend({
  suggested_angles: z.array(
    Angle.partial().extend({ angle: z.string(), why: z.string() }),
  ),
});
export type IdeaAnalysis = z.infer<typeof IdeaAnalysis>;

// ---------------------------------------------------------------------------
// Master brief
// ---------------------------------------------------------------------------

export const CONTENT_FORMATS = ["linkedin", "x_thread", "carousel", "short_video"] as const;
export const ContentFormat = z.enum(CONTENT_FORMATS);
export type ContentFormat = z.infer<typeof ContentFormat>;

export const BRIEF_OBJECTIVES = ["authority", "education", "engagement", "lead_generation", "community"] as const;

export const MasterBriefOutput = z.object({
  idea: z.string(),
  funnel_stage: FunnelStage.describe("The content type this post serves."),
  single_point: z.string().describe("The one point the post makes, in one sentence. Everything in the post serves it."),
  cover_test: z
    .string()
    .describe("What makes this unmistakably the owner's post with their name hidden: worldview, recurring framing, phrasing, the kind of moment they notice."),
  audience: z.string(),
  objective: z.enum(BRIEF_OBJECTIVES),
  content_pillar: z.string().describe("One of the brand's content pillars."),
  core_argument: z.string(),
  position: z.string().describe("The stance the brand takes."),
  // Messaging structure (Brand Guidelines §7.5), in order.
  problem: z.string().describe("1. The business challenge."),
  why_it_matters: z.string().describe("2. Why it matters to the audience."),
  root_cause: z.string().describe("3. The underlying cause."),
  response: z.string().describe("4. The strategic or operational response."),
  technology_role: z.string().describe("5. How technology supports it, or 'none' if it does not."),
  success_measure: z.string().describe("6. How success would be measured."),
  supporting_points: z.array(z.string()),
  evidence: z.array(
    z.object({
      claim: z.string(),
      status: z.enum(["verified_knowledge", "owner_experience", "opinion", "needs_evidence"]),
      knowledge_id: z.string().nullable(),
    }),
  ),
  story_angle: z.string(),
  hooks: z.array(z.string()).describe("Three candidate opening lines in the owner's voice."),
  desired_action: z.string().describe("The one small action the reader can take today."),
  selected_formats: z.array(ContentFormat),
  voice_constraints: z.array(z.string()),
  open_questions: z.array(z.string()).describe("Anything the owner must confirm before production."),
});

/** Stored brief. Briefs written before Strategist v3 lack the newer fields, so they are optional. */
export const MasterBrief = MasterBriefOutput.extend({
  funnel_stage: FunnelStage.optional(),
  single_point: z.string().optional(),
  cover_test: z.string().optional(),
});
export type MasterBrief = z.infer<typeof MasterBrief>;
export type MasterBriefOutput = z.infer<typeof MasterBriefOutput>;

// ---------------------------------------------------------------------------
// API inputs
// ---------------------------------------------------------------------------

export const ProjectCreate = z.object({
  idea_id: Uuid,
  title: z.string().trim().min(1).max(200).optional(),
  formats: z.array(ContentFormat).min(1).max(CONTENT_FORMATS.length).default(["linkedin", "x_thread"]),
});
export type ProjectCreate = z.infer<typeof ProjectCreate>;

export const BriefRequest = z.object({
  /** Optional steer from the owner, e.g. "focus on salons". Treated as an instruction. */
  guidance: z.string().trim().max(2000).optional(),
});
export type BriefRequest = z.infer<typeof BriefRequest>;

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

export const KNOWLEDGE_KINDS = [
  "example_post",
  "opinion",
  "experience",
  "story",
  "fact",
  "voice_rule",
  "audience_insight",
  "offer",
  "banned_phrase",
] as const;
export const KnowledgeKind = z.enum(KNOWLEDGE_KINDS);
export type KnowledgeKind = z.infer<typeof KnowledgeKind>;

/** Kinds that generation may only use once the owner marks them verified. */
export const KINDS_REQUIRING_VERIFICATION: readonly KnowledgeKind[] = ["fact", "story", "experience"];

export const KnowledgeCreate = z.object({
  brand_id: Uuid.optional(),
  kind: KnowledgeKind,
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  source: z.string().trim().max(500).optional(),
  verified: z.boolean().default(false),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).default([]),
});
export type KnowledgeCreate = z.infer<typeof KnowledgeCreate>;

export const KnowledgeUpdate = KnowledgeCreate.omit({ brand_id: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "At least one field must be provided");
export type KnowledgeUpdate = z.infer<typeof KnowledgeUpdate>;

export const KnowledgeListQuery = PaginationQuery.extend({
  brand_id: Uuid.optional(),
  kind: KnowledgeKind.optional(),
});
export type KnowledgeListQuery = z.infer<typeof KnowledgeListQuery>;

export interface KnowledgeEntry {
  id: string;
  brand_id: string;
  kind: KnowledgeKind;
  title: string;
  body: string;
  source: string | null;
  verified: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Settings (budgets)
// ---------------------------------------------------------------------------

const Usd = z.number().min(0).max(10_000);

/** Models the owner may assign to a task in Settings. Keep in sync with provider-gateway ALLOWED_MODELS. */
export const MODEL_CHOICES = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export const ModelChoice = z.enum(MODEL_CHOICES);
export type ModelChoice = z.infer<typeof ModelChoice>;

export const ModelRoutes = z.object({
  idea_analysis: ModelChoice.optional(),
  master_brief: ModelChoice.optional(),
  research_labeling: ModelChoice.optional(),
  gap_synthesis: ModelChoice.optional(),
  idea_screening: ModelChoice.optional(),
  format_writing: ModelChoice.optional(),
  section_revision: ModelChoice.optional(),
});
export type ModelRoutes = z.infer<typeof ModelRoutes>;

export const SettingsUpdate = z
  .object({
    budget_text_project_usd: Usd,
    budget_media_project_usd: Usd,
    budget_daily_usd: Usd,
    budget_monthly_usd: Usd,
    model_routes: ModelRoutes,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "At least one field must be provided");
export type SettingsUpdate = z.infer<typeof SettingsUpdate>;

export interface UserSettings {
  budget_text_project_usd: number;
  budget_media_project_usd: number;
  budget_daily_usd: number;
  budget_monthly_usd: number;
  /** Owner's model choice per task; unset tasks use the default route (Claude Sonnet 5.5). */
  model_routes: ModelRoutes;
}

/** Read model routes from the settings preferences JSON, dropping anything invalid. */
export function readModelRoutes(preferences: unknown): ModelRoutes {
  const raw = (preferences as { model_routes?: unknown } | null)?.model_routes;
  const parsed = ModelRoutes.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export const JOB_TYPES = ["analyze_idea", "generate_brief", "research_sweep", "write_content", "revise_section"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export type JobStatus = "queued" | "running" | "awaiting_approval" | "completed" | "failed" | "cancelled";

export interface JobView {
  job_id: string;
  job_type: string;
  status: JobStatus;
  progress: number;
  current_step: string | null;
  steps: Array<{ name: string; status: string }>;
  error: { code: string; message: string } | null;
  estimated_cost_usd: number | null;
  actual_cost_usd: number;
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
