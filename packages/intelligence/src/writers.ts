/**
 * Phase 3 format writers and the section reviser. Every writer works from the approved master
 * brief only; it never changes the single point, the position or the evidence status of a claim.
 */
import {
  DraftOutput,
  SectionRevisionOutput,
  type ContentFormat,
  type DraftBody,
  type MasterBrief,
  type SourcePost,
} from "@contentos/schemas";
import type { GenerateRequest } from "@contentos/provider-gateway";
import { CRAFT_RULES, type AgentContext } from "./agents";
import { renderAvoidList, type AvoidList } from "./avoid";
import { renderSourcePost } from "./source-post";
import { asData, composeSystem, renderKnowledge, type PromptTemplate } from "./prompts";

/** The owner's approved learned rules, appended to the system prompt when present. */
function withRules(system: string, rules?: string[]): string {
  return rules?.length ? `${system}\n\n---\n\n# The owner's approved learned rules (follow them)\n${rules.map((r) => `- ${r}`).join("\n")}` : system;
}

const SHARED = `You write one piece of content from an approved master brief.

- Make exactly the brief's single_point. Keep the owner's position and argument; do not add a second point.
- Open with the strongest of the brief's hooks, or a sharper one in the same spirit that starts from a moment the reader can picture. Never open or close the way a piece in the "do not repeat" list does.
- Tell it with intention: every line moves toward the single point. Never an update ("This week I…") without the lesson.
- Use claims exactly as the brief's evidence list classifies them. needs_evidence claims become [placeholders] or are left out; never state them as fact.
- Any story, number, client detail or result that is not in the verified knowledge goes in [square brackets] for the owner to fill, e.g. [what the client said]. Never invent them.
- Write in the owner's voice (see the voice examples): plain words, short lines, British English, no hype, no banned phrases, no emojis unless her examples use them, no hashtags unless asked.
- End with the brief's desired action, using one of the ending types (observation, curiosity, action, conversation or silence). Pick a different type from the endings in the "do not repeat" list.
- If the brief's funnel_stage is growth (top of funnel, the owner's focus): write for a business owner who has never heard of her — no jargon, no tool names unless the brief needs one, no offer, no link, no "DM me". The close is a low-effort action: a question they can answer from their own business, or something to notice this week.
- single_point and cover_test describe what you wrote, honestly.

${CRAFT_RULES}`;

export const FORMAT_WRITERS: Record<ContentFormat, PromptTemplate> = {
  linkedin: {
    name: "writer-linkedin",
    version: 4,
    text: `${SHARED}

Format: a LinkedIn text post.
- Sections in order: one "hook" (1–2 short lines that earn the "see more" click), then "paragraph" sections (1–3 short lines each, white space between), then one "closing" with the desired action.
- 1,300 characters or fewer in total. Usually 6–12 sections.
- headline, on_screen and broll are null.`,
  },
  x_thread: {
    name: "writer-x-thread",
    version: 4,
    text: `${SHARED}

Format: an X thread.
- First section kind "hook": the first tweet, which must work on its own if nobody opens the thread. Then "tweet" sections; the last one is kind "cta".
- 5–10 tweets in total. Every tweet is 280 characters or fewer, counted strictly. One thought per tweet.
- No "1/" numbering, no "Thread 🧵", no hashtags.
- headline, on_screen and broll are null.`,
  },
  carousel: {
    name: "writer-carousel",
    version: 4,
    text: `${SHARED}

Format: a carousel narrative (text only; design is done later).
- 6–10 slides. Slide 1 is kind "hook" (the cover: a headline that stops the scroll); middle slides are kind "slide"; the last is kind "cta".
- Each slide: headline (the big line, 3–8 words) and text (supporting line, may be empty). One idea per slide, under about 25 words in total.
- The slides read as one story: problem → why it matters → cause → response → measure, following the brief.
- on_screen and broll are null.`,
  },
  short_video: {
    name: "writer-short-video",
    version: 4,
    text: `${SHARED}

Format: a short vertical video script (under 60 seconds, the owner speaking to camera, with screen recordings where useful).
- First section kind "hook": what she says in the first 3 seconds (12 words or fewer). Then "beat" sections; the last is kind "cta".
- 4–8 sections, 150 spoken words or fewer in total. text is exactly what she says, written to be spoken.
- on_screen: short on-screen text for that beat (or null). broll: what is shown — face to camera, a screen recording of a workflow, a diagram (or null). Only suggest showing systems she could really show; never invent client screens.
- headline is null.`,
  },
};

export function buildWriterRequest(
  ctx: AgentContext,
  input: { format: ContentFormat; brief: MasterBrief; guidance?: string; rules?: string[]; avoid?: AvoidList | null; sourcePost?: SourcePost | null },
): GenerateRequest<DraftOutput> {
  const parts = [
    `Write the ${input.format.replace("_", " ")} for this approved brief.`,
    asData("brief", JSON.stringify(input.brief, null, 2)),
    "Verified knowledge you may use as real (cite nothing else as real):",
    renderKnowledge(ctx.related),
  ];
  const avoid = renderAvoidList(input.avoid);
  if (avoid) parts.push(avoid);
  const source = renderSourcePost(input.sourcePost);
  if (source) parts.push(source);
  if (input.guidance) parts.push(`Owner's guidance for this draft: ${input.guidance}`);
  return {
    task: "format_writing",
    system: withRules(composeSystem({ brand: ctx.brand, examples: ctx.examples, skill: FORMAT_WRITERS[input.format] }), input.rules),
    messages: [{ role: "user", content: parts.join("\n\n") }],
    schema: DraftOutput,
  };
}

export const SECTION_REVISER: PromptTemplate = {
  name: "section-reviser",
  version: 3,
  text: `You revise exactly one section of a draft, following the owner's instruction.

- Change only the target section. The other sections are context; they stay as they are.
- Keep the piece's single point, the owner's position and the format's limits (tweet 280 characters; slide under about 25 words; spoken hook 12 words or fewer).
- Never invent stories, numbers or client details; keep or add [placeholders] instead.
- Keep fields that do not apply to the format null.
- note says in one sentence what you changed.

${CRAFT_RULES}`,
};

export function buildRevisionRequest(
  ctx: Pick<AgentContext, "brand" | "examples">,
  input: { body: DraftBody; sectionKey: string; instruction: string; rules?: string[]; avoid?: AvoidList | null },
): GenerateRequest<SectionRevisionOutput> {
  const draft = input.body.sections
    .map((s) => `[${s.key}] (${s.kind})${s.headline ? ` headline: ${s.headline} |` : ""} ${s.text}${s.on_screen ? ` | on screen: ${s.on_screen}` : ""}${s.broll ? ` | show: ${s.broll}` : ""}`)
    .join("\n");
  return {
    task: "section_revision",
    system: withRules(composeSystem({ brand: ctx.brand, examples: ctx.examples, skill: SECTION_REVISER }), input.rules),
    messages: [
      {
        role: "user",
        content: [
          `Format: ${input.body.format}. Single point: ${input.body.single_point}`,
          asData("draft", draft),
          renderAvoidList(input.avoid),
          `Target section: ${input.sectionKey}`,
          // The instruction is the owner's own words, not external data.
          `Owner's instruction: ${input.instruction}`,
        ].join("\n\n"),
      },
    ],
    schema: SectionRevisionOutput,
  };
}
