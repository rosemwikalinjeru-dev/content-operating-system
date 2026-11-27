/**
 * Editorial eval: does the reviewer score the owner's real posts above generic AI posts?
 *
 *   ANTHROPIC_API_KEY=... pnpm eval:editorial
 *
 * Owner posts: the voice samples plus any .md files in evals/editorial/owner-posts/.
 * Leave-one-out: a post is never among the voice examples the reviewer sees while scoring it.
 * Writes a report to docs/evals/. Skipped when no API key is set. Costs roughly $0.01–0.03 per post.
 */
import { buildReviewRequest, EDITORIAL_REVIEWER, templateHash, VOICE_SAMPLES } from "@contentos/intelligence";
import { AnthropicProvider, DEFAULT_ROUTES } from "@contentos/provider-gateway";
import { ROSE_NJERU_DEFAULTS, toDraftBody, weightedScore, type BrandProfile } from "@contentos/schemas";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GENERIC_POSTS } from "./generic-posts";
import { buildReport, type EvalScore } from "./report";

const root = resolve(import.meta.dirname, "../..");
const brand = { id: "eval", is_default: true, status: "active", created_at: "", updated_at: "", ...ROSE_NJERU_DEFAULTS } as unknown as BrandProfile;

function ownerPosts(): Array<{ id: string; title: string; text: string }> {
  const samples = VOICE_SAMPLES.filter((s) => s.kind === "example_post").map((s, i) => ({ id: `owner-sample-${i + 1}`, title: s.title, text: s.body }));
  const dir = resolve(import.meta.dirname, "owner-posts");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md");
  return [...samples, ...files.map((f) => ({ id: `owner-${f.replace(/\.md$/, "")}`, title: f, text: readFileSync(resolve(dir, f), "utf8").trim() }))];
}

/** Treat a whole post as a LinkedIn draft: first paragraph is the hook. */
function asDraft(text: string) {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return toDraftBody("linkedin", {
    sections: paras.map((p, i) => ({ kind: i === 0 ? "hook" : i === paras.length - 1 ? "closing" : "paragraph", text: p, headline: null, on_screen: null, broll: null })),
    single_point: "",
    cover_test: "",
  });
}

describe.skipIf(!process.env.ANTHROPIC_API_KEY)("editorial eval", () => {
  it("scores the owner's posts above generic AI posts", { timeout: 900_000 }, async () => {
    const provider = new AnthropicProvider();
    const route = { ...DEFAULT_ROUTES.editorial_review, ...(process.env.EVAL_MODEL ? { model: process.env.EVAL_MODEL } : {}) };
    const owners = ownerPosts();
    const items = [
      ...owners.map((p) => ({ ...p, group: "owner" as const })),
      ...GENERIC_POSTS.map((p) => ({ ...p, title: p.id, group: "generic" as const })),
    ];
    const scores: EvalScore[] = [];
    for (const item of items) {
      const examples = owners.filter((o) => o.id !== item.id).slice(0, 6).map((o) => ({ id: o.id, title: o.title, body: o.text }));
      const req = buildReviewRequest({ brand, examples, related: [], rules: [] }, { body: asDraft(item.text), brief: null });
      const result = await provider.generate(req, route);
      scores.push({ id: item.id, group: item.group, score: weightedScore(result.output.dimensions) });
    }
    const report = buildReport({
      prompt: { name: EDITORIAL_REVIEWER.name, version: EDITORIAL_REVIEWER.version, hash: templateHash(EDITORIAL_REVIEWER).slice(0, 12) },
      model: route.model,
      ran_at: new Date().toISOString(),
      scores,
    });
    const out = resolve(root, "docs/evals");
    mkdirSync(out, { recursive: true });
    writeFileSync(resolve(out, `editorial-v${EDITORIAL_REVIEWER.version}-${report.ran_at.slice(0, 10)}.json`), `${JSON.stringify(report, null, 2)}\n`);
    console.warn(`owner ${report.owner.mean} vs generic ${report.generic.mean} (gap ${report.gap}, pairwise ${report.pairwise}) → ${report.passed ? "PASS" : "FAIL"}`);
    expect(report.gap).toBeGreaterThan(0);
  });
});
