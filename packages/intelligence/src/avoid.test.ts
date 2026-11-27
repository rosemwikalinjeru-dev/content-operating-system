import { checkDraft, ROSE_NJERU_DEFAULTS, toDraftBody } from "@contentos/schemas";
import { describe, expect, it } from "vitest";
import { CRAFT_RULES, IDEA_ANALYST, STRATEGIST } from "./agents";
import { EDITORIAL_REVIEWER, RULE_PROPOSER } from "./editorial";
import { GAP_SYNTHESISER, IDEA_SCREENER, RESEARCH_LABELLER } from "./research-agents";
import { FORMAT_WRITERS, SECTION_REVISER } from "./writers";
import { buildAvoidList, normalise, pieceFromPost, renderAvoidList } from "./avoid";
import { findRepetition } from "./editorial";
import { VOICE_SAMPLES } from "./voice-samples";
import { buildWriterRequest } from "./writers";

const brand = { id: "b", is_default: true, status: "active", created_at: "", updated_at: "", ...ROSE_NJERU_DEFAULTS } as never;

describe("do-not-repeat list", () => {
  it("collects openings, endings and phrases recurring across two or more pieces", () => {
    const avoid = buildAvoidList([
      pieceFromPost("A plumber misses a call at 7am.\n\nThe quote goes cold by Friday.\n\nNotice who calls back first this week."),
      pieceFromPost("Your receptionist is on lunch.\n\nThe quote goes cold by Friday afternoon.\n\nCount the missed calls today."),
    ]);
    expect(avoid.openers).toEqual(["A plumber misses a call at 7am.", "Your receptionist is on lunch."]);
    expect(avoid.closers).toEqual(["Notice who calls back first this week.", "Count the missed calls today."]);
    expect(avoid.phrases).toContain("the quote goes cold by");
  });

  it("renders as data and is given to every writer", () => {
    const avoid = { openers: ["Opening already used here."], closers: [], phrases: ["phrase already used twice"] };
    expect(renderAvoidList(avoid)).toMatch(/^<data label="do_not_repeat">/);
    expect(renderAvoidList({ openers: [], closers: [], phrases: [] })).toBe("");
    const req = buildWriterRequest({ brand, examples: [], related: [] }, { format: "linkedin", brief: { single_point: "p" } as never, avoid });
    expect(req.messages[0]!.content).toContain("Opening already used here.");
  });
});

describe("craft rules never quote the owner's posts", () => {
  it("no prompt shares a six-word phrase with any voice sample (writers would copy it)", () => {
    const prompts = [IDEA_ANALYST, STRATEGIST, EDITORIAL_REVIEWER, RULE_PROPOSER, GAP_SYNTHESISER, IDEA_SCREENER, RESEARCH_LABELLER, SECTION_REVISER, ...Object.values(FORMAT_WRITERS)];
    const rules = ` ${normalise([CRAFT_RULES, ...prompts.map((p) => p.text)].join(" "))} `;
    for (const s of VOICE_SAMPLES) {
      const words = normalise(s.body).split(" ");
      for (let i = 0; i + 6 <= words.length; i++) {
        const g = words.slice(i, i + 6).join(" ");
        expect(rules.includes(` ${g} `), `"${g}" from ${s.title}`).toBe(false);
      }
    }
  });

  it("repetition of a published post is detected for the approval gate", () => {
    const post = VOICE_SAMPLES.find((s) => s.kind === "example_post")!;
    const firstPara = post.body.split(/\n\s*\n/)[0]!;
    const draft = toDraftBody("linkedin", { sections: [{ kind: "hook", text: firstPara, headline: null, on_screen: null, broll: null }], single_point: "", cover_test: "" });
    const found = findRepetition(draft, [{ text: post.body, hook: firstPara, seenIn: "your published posts" }]);
    expect(found.map((f) => f.kind)).toContain("hook");
  });
});

describe("AI-content traps", () => {
  it("warns about jargon and formula endings", () => {
    const sections = toDraftBody("linkedin", {
      sections: [
        { kind: "hook", text: "We leveraged automation to streamline intake.", headline: null, on_screen: null, broll: null },
        { kind: "closing", text: "What do you think? Comment below!", headline: null, on_screen: null, broll: null },
      ],
      single_point: "",
      cover_test: "",
    }).sections;
    const msgs = checkDraft("linkedin", sections).map((c) => c.message);
    expect(msgs.some((m) => m.includes("leverage") && m.includes("streamline"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("Formula ending"))).toBe(true);
  });
});

describe("habits the reviewer flagged on the first live draft", () => {
  const draft = (text: string) =>
    toDraftBody("linkedin", { sections: [{ kind: "paragraph", text, headline: null, on_screen: null, broll: null }], single_point: "", cover_test: "" }).sections;

  it("warns on the published reframe construction and on scenario disclaimers", () => {
    expect(checkDraft("linkedin", draft("That's not a tooling problem. It's a measuring problem.")).map((c) => c.message).join(" ")).toMatch(/reframe/);
    expect(checkDraft("linkedin", draft("This is a typical scenario, not a client story.")).map((c) => c.message).join(" ")).toMatch(/disclaimer/);
    expect(checkDraft("linkedin", draft("Your client's details arrive at 9am.")).filter((c) => /reframe|disclaimer/.test(c.message))).toEqual([]);
  });

  it("the rules ban the reframe and require the opening scene to carry through", () => {
    expect(CRAFT_RULES).toContain("Never use the reframe");
    expect(CRAFT_RULES).toContain("Carry the opening moment through");
  });
});
