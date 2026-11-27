import {
  FUNNEL_STAGE_GUIDE,
  FUNNEL_STAGES,
  HOOK_PATTERNS,
  IdeaAnalysisOutput,
  MasterBriefOutput,
  type FunnelStage,
  type IdeaAnalysis,
  type BrandProfile,
  type ContentFormat,
  type KnowledgeEntry,
} from "@contentos/schemas";
import type { GenerateRequest } from "@contentos/provider-gateway";
import { asData, composeSystem, renderKnowledge, type PromptTemplate } from "./prompts";

type Knowledge = Pick<KnowledgeEntry, "id" | "kind" | "title" | "body">;

export interface AgentContext {
  brand: BrandProfile;
  /** The owner's example posts (voice reference). */
  examples: Pick<KnowledgeEntry, "id" | "title" | "body">[];
  /** Knowledge retrieved for this idea (already filtered to usable entries). */
  related: Knowledge[];
}

// ---------------------------------------------------------------------------
// Craft rules (shared by every agent that writes hooks or angles)
// ---------------------------------------------------------------------------

/**
 * Hook and delivery craft. Drawn from the owner's craft benchmarks (docs/research): Justin Welsh
 * for single-idea delivery and short parallel lines, Alex Hormozi for plain commercial logic —
 * techniques only, never their topics, claims or aggressive tone.
 */
export const CRAFT_RULES = `Hook and delivery craft:
- Start from a moment someone can picture: a person, a time, an action. "A customer messages at 9pm on Friday" beats "communication gaps".
- Make the reader the subject. Their calls, their quotes, their money. Avoid abstract nouns as the subject ("data", "AI", "systems", "efficiency").
- Commercial logic in plain words: if X, then Y. "You pay for the click, then lose the call." No percentages unless the owner supplied them.
- One idea per post. Short lines. Parallel structure where it fits ("Each one feels small. Together, they're a second business.").
- A personal lesson only when the owner's knowledge or idea says it happened. Never invent the owner's experience.
- Any number or detail only the owner knows goes in [square brackets] as a placeholder.
- Reject slogans that could headline any automation agency's post. If a line works without the owner's context, it is too generic.
- Use the two-line reframe ("That's not an X problem. It's a Y problem.") at most once across all suggestions.
- Hook patterns available: ${HOOK_PATTERNS.join(", ")}.

The owner's post rules (non-negotiable):
- One point per post. If a second point appears, it belongs in another post.
- A strong hook: the first line earns the second.
- Storytelling with intention: every story leads to the single point. Never an update ("This week I…") without a lesson.
- The cover test: with the owner's name and photo hidden, a reader should still know it is her — through her worldview, her framing, the moments she notices, her rhythm (see the voice examples).

Content types (funnel stages):
${FUNNEL_STAGES.map((f) => `- ${f}: ${FUNNEL_STAGE_GUIDE[f]}`).join("\n")}`;

// ---------------------------------------------------------------------------
// Idea Analyst
// ---------------------------------------------------------------------------

export const IDEA_ANALYST: PromptTemplate = {
  name: "idea-analyst",
  version: 4,
  text: `You are the Idea Analyst. Analyse the owner's raw idea before any content is written.

1. Restate the idea plainly and identify the single core argument.
2. Classify every claim as fact, opinion, experience or assumption. Mark needs_evidence for any factual or numeric claim that is not supported by the supplied knowledge.
3. List the information the owner must supply to write this well.
4. Judge genericity honestly: could a generic AI automation agency publish this idea unchanged? Widely repeated lines ("AI makes broken processes faster", "automate the boring stuff") are generic even when true. If generic, ask 2–4 sharpening questions that pull out the owner's specific observation, example or experience. Never invent the answer for them.
5. Describe audience fit in the audience's own words.
6. Suggest three to five angles. Each angle needs: a specific_moment (concrete and observable), a hook_pattern, a sample_hook written in the owner's voice, a structure (how the post is delivered), a funnel_stage, why it is specific to this owner, and needs_from_owner (what they must supply, or null). Every angle uses a different hook_pattern and a different moment, and at least two of them must be growth (top-of-funnel) angles, since TOFU is the owner's focus; others may serve another content type where the idea suits it. Prefer angles that turn a business owner's ordinary day into the hook over angles that explain a concept.
7. Cite related knowledge only by the IDs provided.
8. Recommend the next step: create_brief if the idea is specific and supportable; sharpen_idea if it is generic; gather_evidence if it rests on unsupported facts.

${CRAFT_RULES}`,
};

export function buildIdeaAnalysisRequest(ctx: AgentContext, idea: { title: string; raw_input: string }): GenerateRequest<IdeaAnalysis> {
  return {
    task: "idea_analysis",
    system: composeSystem({ brand: ctx.brand, examples: ctx.examples, skill: IDEA_ANALYST }),
    messages: [
      {
        role: "user",
        content: [
          "Analyse this idea.",
          asData("idea", `Title: ${idea.title}\n\n${idea.raw_input}`),
          "Related knowledge from the owner's knowledge base:",
          renderKnowledge(ctx.related),
        ].join("\n\n"),
      },
    ],
    schema: IdeaAnalysisOutput,
  };
}

// ---------------------------------------------------------------------------
// Content Strategist (master brief)
// ---------------------------------------------------------------------------

export const STRATEGIST: PromptTemplate = {
  name: "content-strategist",
  version: 4,
  text: `You are the Content Strategist. Turn the idea into a master brief that every platform writer will follow.

- Choose the funnel_stage this post serves. The owner's focus is top-of-funnel (growth) content: choose growth unless the idea clearly belongs elsewhere, and use the target and recent mix to decide when another type is due.
- For a growth brief: write for a business owner who has never heard of her; no offer or pitch; the desired action is low effort (reply, save, or notice something in their own business).
- State the single_point in one sentence. Every supporting point, story and hook must serve it.
- Explain in cover_test what makes this unmistakably the owner's post with her name hidden.
- Build the argument with the brand's messaging structure, in order: problem → why it matters → root cause → response → technology's role → how success is measured. If technology plays no role, say "none".
- Keep the owner's position. Choose the content pillar from the brand's list.
- Evidence: list every claim with its status. Use verified_knowledge only for claims backed by a supplied knowledge entry (give its ID), owner_experience only for verified experiences in the knowledge, opinion for the owner's views, and needs_evidence for anything else. Never upgrade a claim's status.
- Write three candidate hooks in the owner's voice (see the voice examples), each using a different hook pattern and opening on a specific moment or the reader's money, short lines, no hype. If the idea analysis suggested angles, build on the strongest one.
- The desired action is one small thing the reader can do today.
- Put anything the owner must confirm in open_questions. Do not fill gaps with invented detail.
- selected_formats must be exactly the formats requested.

${CRAFT_RULES}`,
};

export function buildBriefRequest(
  ctx: AgentContext,
  input: {
    idea: { title: string; raw_input: string };
    analysis: IdeaAnalysis | null;
    formats: ContentFormat[];
    guidance?: string;
    /** Content types of recently approved briefs, newest first (used to balance the mix). */
    recentStages?: FunnelStage[];
  },
): GenerateRequest<MasterBriefOutput> {
  const parts = [
    "Write the master brief for this idea.",
    asData("idea", `Title: ${input.idea.title}\n\n${input.idea.raw_input}`),
  ];
  if (input.analysis) parts.push("Idea analysis:", asData("analysis", JSON.stringify(input.analysis, null, 2)));
  parts.push("Related knowledge from the owner's knowledge base:", renderKnowledge(ctx.related));
  parts.push(`Requested formats: ${input.formats.join(", ")}`);
  parts.push(describeMix(ctx.brand.brand_guidelines.content_mix, input.recentStages ?? []));
  // Owner guidance is an instruction from the owner, not external data.
  if (input.guidance) parts.push(`Owner's guidance for this brief: ${input.guidance}`);

  return {
    task: "master_brief",
    system: composeSystem({ brand: ctx.brand, examples: ctx.examples, skill: STRATEGIST }),
    messages: [{ role: "user", content: parts.join("\n\n") }],
    schema: MasterBriefOutput,
  };
}

/** Target vs recent content mix, as a short plain-text note for the Strategist. */
export function describeMix(target: Record<FunnelStage, number>, recent: FunnelStage[]): string {
  const counts = Object.fromEntries(FUNNEL_STAGES.map((f) => [f, 0])) as Record<FunnelStage, number>;
  for (const s of recent) counts[s]++;
  const total = recent.length;
  const lines = FUNNEL_STAGES.map((f) => {
    const actual = total ? Math.round((counts[f] / total) * 100) : 0;
    return `- ${f}: target ${target[f]}%, recent ${total ? `${actual}% (${counts[f]} of ${total})` : "no data"}`;
  });
  return `Content mix (target vs last ${total} approved briefs):\n${lines.join("\n")}`;
}

/** Enforce what the model must not change, after generation. */
export function finaliseBrief(brief: MasterBriefOutput, formats: ContentFormat[]): MasterBriefOutput {
  return { ...brief, selected_formats: [...formats] };
}
