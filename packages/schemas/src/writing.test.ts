import { describe, expect, it } from "vitest";
import { applyManualEdit, checkDraft, findPlaceholders, formatFromAsset, toDraftBody, toMarkdown, type DraftOutput } from "./writing";

const sec = (kind: DraftOutput["sections"][number]["kind"], text: string, extra: Partial<DraftOutput["sections"][number]> = {}) => ({
  kind,
  text,
  headline: null,
  on_screen: null,
  broll: null,
  ...extra,
});

describe("draft bodies", () => {
  it("assigns keys in order, trims text and finds owner placeholders", () => {
    const body = toDraftBody("linkedin", {
      sections: [sec("hook", "  A client called at 9pm. "), sec("paragraph", "They had [number] missed calls."), sec("closing", "Check yours today.")],
      single_point: "p",
      cover_test: "c",
    });
    expect(body.sections.map((s) => s.key)).toEqual(["s1", "s2", "s3"]);
    expect(body.sections[0]!.text).toBe("A client called at 9pm.");
    expect(body.placeholders).toEqual(["[number]"]);
    expect(body.checks).toEqual([]);
  });

  it("warns about platform limits instead of cutting text", () => {
    const tweets = Array.from({ length: 3 }, (_, i) => ({ key: `s${i + 1}`, kind: "tweet" as const, text: i === 1 ? "x".repeat(300) : "ok", headline: null, on_screen: null, broll: null }));
    const checks = checkDraft("x_thread", tweets);
    expect(checks.map((c) => c.message)).toEqual(["3 tweets; aim for 5–10.", "300 characters; a tweet allows 280."]);
    expect(checks[1]!.section).toBe("s2");
    const long = [{ key: "s1", kind: "hook" as const, text: "word ".repeat(20), headline: null, on_screen: null, broll: null }];
    expect(checkDraft("short_video", long).some((c) => c.message.includes("3 seconds"))).toBe(true);
  });

  it("ignores markdown-style links and short brackets as placeholders", () => {
    const s = [{ key: "s1", kind: "paragraph" as const, text: "See [x] and [what the client said]", headline: null, on_screen: null, broll: null }];
    expect(findPlaceholders(s)).toEqual(["[what the client said]"]);
  });

  it("records hand edits and rebuilds placeholders", () => {
    const body = toDraftBody("carousel", {
      sections: [sec("hook", "[result]", { headline: "Cover" }), sec("cta", "Do this")],
      single_point: "p",
      cover_test: "c",
    });
    const { body: next, changed } = applyManualEdit(body, [{ key: "s1", text: "Three quotes a week", headline: "Cover" }]);
    expect(changed).toBe(1);
    expect(next.placeholders).toEqual([]);
    expect(next.edits).toEqual([{ key: "s1", before: "[result]", after: "Three quotes a week" }]);
    expect(next.sections[1]).toEqual(body.sections[1]);
  });

  it("exports paste-ready text per format", () => {
    const li = toDraftBody("linkedin", { sections: [sec("hook", "One."), sec("closing", "Two.")], single_point: "", cover_test: "" });
    expect(toMarkdown(li)).toBe("One.\n\nTwo.");
    const v = toDraftBody("short_video", { sections: [sec("hook", "Hi", { on_screen: "HI", broll: "face" })], single_point: "", cover_test: "" });
    expect(toMarkdown(v)).toBe("**1. Hook**\n\nSay: Hi\n\nOn screen: HI\n\nShow: face");
  });

  it("maps asset rows back to formats", () => {
    expect(formatFromAsset("x", "thread")).toBe("x_thread");
    expect(formatFromAsset("instagram", "post")).toBeNull();
  });
});
