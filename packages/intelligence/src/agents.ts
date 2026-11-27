import {
  IdeaAnalysis,
  MasterBrief,
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
// Idea Analyst
// ---------------------------------------------------------------------------

export const IDEA_ANALYST: PromptTemplate = {
  name: "idea-analyst",
  version: 1,
  text: `You are the Idea Analyst. Analyse the owner's raw idea before any content is written.

1. Restate the idea plainly and identify the single core argument.
2. Classify every claim as fact, opinion, experience or assumption. Mark needs_evidence for any factual or numeric claim that is not supported by the supplied knowledge.
3. List the information the owner must supply to write this well.
4. Judge genericity honestly: could a generic AI automation agency publish this idea unchanged? Widely repeated lines ("AI makes broken processes faster", "automate the boring stuff") are generic even when true. If generic, ask 2–4 sharpening questions that pull out the owner's specific observation, example or experience. Never invent the answer for them.
5. Describe audience fit in the audience's own words, and suggest up to three sharper angles.
6. Cite related knowledge only by the IDs provided.
7. Recommend the next step: create_brief if the idea is specific and supportable; sharpen_idea if it is generic; gather_evidence if it rests on unsupported facts.`,
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
    schema: IdeaAnalysis,
  };
}

// ---------------------------------------------------------------------------
// Content Strategist (master brief)
// ---------------------------------------------------------------------------

export const STRATEGIST: PromptTemplate = {
  name: "content-strategist",
  version: 1,
  text: `You are the Content Strategist. Turn the idea into a master brief that every platform writer will follow.

- Build the argument with the brand's messaging structure, in order: problem → why it matters → root cause → response → technology's role → how success is measured. If technology plays no role, say "none".
- Keep the owner's position. Choose the content pillar from the brand's list.
- Evidence: list every claim with its status. Use verified_knowledge only for claims backed by a supplied knowledge entry (give its ID), owner_experience only for verified experiences in the knowledge, opinion for the owner's views, and needs_evidence for anything else. Never upgrade a claim's status.
- Write three candidate hooks in the owner's voice (see the voice examples): open with the hidden cost or a specific moment, short lines, no hype.
- The desired action is one small thing the reader can do today.
- Put anything the owner must confirm in open_questions. Do not fill gaps with invented detail.
- selected_formats must be exactly the formats requested.`,
};

export function buildBriefRequest(
  ctx: AgentContext,
  input: {
    idea: { title: string; raw_input: string };
    analysis: IdeaAnalysis | null;
    formats: ContentFormat[];
    guidance?: string;
  },
): GenerateRequest<MasterBrief> {
  const parts = [
    "Write the master brief for this idea.",
    asData("idea", `Title: ${input.idea.title}\n\n${input.idea.raw_input}`),
  ];
  if (input.analysis) parts.push("Idea analysis:", asData("analysis", JSON.stringify(input.analysis, null, 2)));
  parts.push("Related knowledge from the owner's knowledge base:", renderKnowledge(ctx.related));
  parts.push(`Requested formats: ${input.formats.join(", ")}`);
  // Owner guidance is an instruction from the owner, not external data.
  if (input.guidance) parts.push(`Owner's guidance for this brief: ${input.guidance}`);

  return {
    task: "master_brief",
    system: composeSystem({ brand: ctx.brand, examples: ctx.examples, skill: STRATEGIST }),
    messages: [{ role: "user", content: parts.join("\n\n") }],
    schema: MasterBrief,
  };
}

/** Enforce what the model must not change, after generation. */
export function finaliseBrief(brief: MasterBrief, formats: ContentFormat[]): MasterBrief {
  return { ...brief, selected_formats: [...formats] };
}
