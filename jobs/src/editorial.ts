/**
 * Phase 4 pipelines.
 *  - reviewVersion: deterministic checks + the independent editorial reviewer for one version.
 *    Used by its own job (review_version, owner clicks Review) and automatically after every
 *    AI draft, revision and accepted suggestion.
 *  - propose_rules: turns unused owner edits and rejected suggestions into proposed rules.
 */
import * as svc from "@contentos/database/service";
import {
  buildAvoidList,
  pieceFromBody,
  pieceFromPost,
  type AvoidList,
  buildReviewRequest,
  buildRuleProposalRequest,
  deterministicGates,
  EDITORIAL_REVIEWER,
  findRepetition,
  RULE_PROPOSER,
  templateHash,
} from "@contentos/intelligence";
import { MasterBrief, weightedScore, type BrandProfile, type DraftBody, type GateFailure, type UserSettings } from "@contentos/schemas";
import { z } from "zod";
import { complete, loadAndStart, NonRetryableJobError, promptTemplateId, runStep, stableHash, type PipelineDeps, type RunOptions } from "./pipeline";

function budgets(settings: UserSettings, job: svc.JobRecord) {
  return {
    dailyUsd: settings.budget_daily_usd,
    monthlyUsd: settings.budget_monthly_usd,
    projectUsd: settings.budget_text_project_usd,
    jobUsd: job.budget_limit_usd,
  };
}

function isDraftBody(v: unknown): v is DraftBody {
  return Boolean(v && typeof v === "object" && Array.isArray((v as DraftBody).sections));
}

export interface ReviewShared {
  brand: BrandProfile;
  settings: UserSettings;
  examples: Array<{ id: string; title: string; body: string }>;
  rules: string[];
}

/** Load what every review in a job needs, once. */
export async function loadReviewShared(deps: PipelineDeps, userId: string, brandId: string): Promise<ReviewShared> {
  const [brand, settings, examples, rules] = await Promise.all([
    svc.loadBrand(deps.db, userId, brandId),
    svc.loadSettings(deps.db, userId),
    svc.loadVoiceExamples(deps.db, userId, brandId),
    svc.loadApprovedRules(deps.db, userId, brandId),
  ]);
  return { brand, settings, examples, rules };
}

/** What new writing must not repeat: recent pieces outside this project plus the owner's posts. */
export async function loadAvoidList(
  deps: PipelineDeps,
  userId: string,
  projectId: string | null,
  examples: Array<{ body: string }>,
): Promise<AvoidList> {
  const bodies = (await svc.loadRecentBodies(deps.db, userId, projectId)).filter(isDraftBody);
  return buildAvoidList([...bodies.map(pieceFromBody), ...examples.map((e) => pieceFromPost(e.body))]);
}

/** Review one version as its own resumable step. Returns the review id and score. */
export async function reviewVersion(
  deps: PipelineDeps,
  job: svc.JobRecord,
  opts: RunOptions,
  input: { versionId: string; position: number; name: string; shared: ReviewShared; projectId: string },
): Promise<{ review_id: string; score: number; gates: number }> {
  const userId = job.user_id;
  const { brand, settings, examples, rules } = input.shared;
  const inputHash = stableHash({ v: input.versionId, t: templateHash(EDITORIAL_REVIEWER), rules, brand: brand.updated_at });
  return runStep(deps, job, opts, { name: input.name, position: input.position, inputHash }, async (stepId) => {
    const version = await svc.loadVersionById(deps.db, userId, input.versionId);
    if (!isDraftBody(version.body)) throw new NonRetryableJobError("VALIDATION_FAILED", "This version cannot be reviewed.");
    const body = version.body;
    const asset = await svc.loadAsset(deps.db, userId, version.asset_id);
    const briefRow = asset.brief_id ? await svc.loadBrief(deps.db, userId, asset.brief_id) : null;
    const brief = briefRow ? MasterBrief.safeParse(briefRow.brief) : null;
    const briefData = brief?.success ? brief.data : null;

    const [knowledgeText, related, approved] = await Promise.all([
      svc.loadVerifiedKnowledgeText(deps.db, userId, brand.id),
      svc.searchKnowledge(deps.db, userId, brand.id, `${briefData?.single_point ?? ""} ${body.sections.map((s) => s.text).join(" ")}`.slice(0, 2000)),
      svc.loadApprovedBodies(deps.db, userId, asset.id),
    ]);

    // 1. Deterministic checks (free).
    const checks = deterministicGates({
      body,
      bannedPhrases: brand.voice_profile.banned_phrases,
      sourceText: `${briefRow ? JSON.stringify(briefRow.brief) : ""}\n${knowledgeText}`,
    }).filter((g) => g.code !== "unfilled_placeholder"); // already enforced at approval; shown on the draft
    const corpus = [
      ...approved.filter(isDraftBody).map((b) => ({ text: b.sections.map((s) => [s.headline, s.text].filter(Boolean).join(" ")).join(" "), hook: b.sections[0]?.headline ?? b.sections[0]?.text ?? null, seenIn: "approved content" })),
      ...examples.map((e) => ({ text: e.body, hook: e.body.split("\n").find((l) => l.trim()) ?? null, seenIn: "voice example" })),
    ];
    const repetition = findRepetition(body, corpus);
    // The owner does not repeat herself: reused openings and phrases block approval.
    const repeatGates: GateFailure[] = repetition.map((r) => ({
      code: r.kind === "hook" ? "repeated_hook" : "repeated_phrase",
      section: r.section,
      quote: r.phrase,
      message: `${r.kind === "hook" ? "Same opening" : `"${r.phrase}"`} already used in ${r.seen_in}. Write it fresh.`,
      source: "check",
    }));

    // 2. Independent model review.
    const templateId = await promptTemplateId(deps.db, userId, EDITORIAL_REVIEWER, "Review a draft");
    const result = await deps.controller.generate(
      buildReviewRequest({ brand, examples, related, rules }, { body, brief: briefData, repetition }),
      { userId, projectId: input.projectId, jobId: job.id, stepId, promptTemplateId: templateId },
      budgets(settings, job),
      settings.model_routes.editorial_review,
    );
    const out = result.output;
    const keys = new Set(body.sections.map((s) => s.key));
    const modelGates: GateFailure[] = out.gates.map((g) => ({
      code: g.code,
      section: g.section && keys.has(g.section) ? g.section : null,
      quote: g.quote,
      message: g.message,
      source: "reviewer",
    }));
    const gateFailures = [...checks, ...repeatGates, ...modelGates];
    const score = weightedScore(out.dimensions);
    const reviewId = await svc.insertReview(deps.db, userId, {
      assetId: asset.id,
      version: version.version,
      versionId: version.id,
      jobId: job.id,
      promptTemplateId: templateId,
      provider: result.provider,
      model: result.model,
      totalScore: score,
      dimensions: out.dimensions,
      gateFailures,
      repetition,
      coldReader: out.cold_reader,
      issues: out.suggestions.map((s) => ({ section: s.section, dimension: s.dimension, issue: s.issue })),
    });
    // Suggestions for sections that do not exist are dropped, never applied to the wrong place.
    await svc.insertSuggestions(
      deps.db,
      userId,
      out.suggestions
        .filter((s) => keys.has(s.section) && s.text.trim())
        .slice(0, 5)
        .map((s) => ({
          reviewId,
          assetId: asset.id,
          versionId: version.id,
          sectionKey: s.section,
          dimension: s.dimension,
          issue: s.issue,
          rewrite: { text: s.text.trim(), headline: s.headline?.trim() || null, on_screen: s.on_screen?.trim() || null, broll: s.broll?.trim() || null },
        })),
    );
    return { output: { review_id: reviewId, score, gates: gateFailures.length }, cost: result.costUsd };
  });
}

// ---------------------------------------------------------------------------
// review_version job
// ---------------------------------------------------------------------------

const ReviewInput = z.object({ version_id: z.uuid(), nonce: z.string().optional() });

export async function runReviewVersion(deps: PipelineDeps, jobId: string, opts: RunOptions): Promise<void> {
  const job = await loadAndStart(deps, jobId, "review_version");
  if (!job) return;
  const input = ReviewInput.safeParse(job.input);
  if (!input.success) throw new NonRetryableJobError("VALIDATION_FAILED", "Job input is invalid.");
  const version = await svc.loadVersionById(deps.db, job.user_id, input.data.version_id);
  const asset = await svc.loadAsset(deps.db, job.user_id, version.asset_id);
  const project = await svc.loadProject(deps.db, job.user_id, asset.project_id);
  const shared = await loadReviewShared(deps, job.user_id, project.brand_id);
  await svc.updateJob(deps.db, job, { progress: 30, current_step: "reviewing" });
  await reviewVersion(deps, job, opts, { versionId: version.id, position: 1, name: "review", shared, projectId: project.id });
  await complete(deps, job);
}

// ---------------------------------------------------------------------------
// propose_rules job
// ---------------------------------------------------------------------------

export async function runProposeRules(deps: PipelineDeps, jobId: string, opts: RunOptions): Promise<void> {
  const job = await loadAndStart(deps, jobId, "propose_rules");
  if (!job) return;
  const userId = job.user_id;
  const brandId = await svc.defaultBrandId(deps.db, userId);
  const [editVersions, rejections, existing, settings] = await Promise.all([
    svc.loadUnusedEdits(deps.db, userId),
    svc.loadUnusedRejections(deps.db, userId),
    svc.loadAllRules(deps.db, userId, brandId),
    svc.loadSettings(deps.db, userId),
  ]);
  const edits = editVersions.flatMap((v) => v.edits.map((e) => ({ versionId: v.id, ...e }))).filter((e) => e.before.trim() !== e.after.trim()).slice(0, 30);
  if (!edits.length && !rejections.length) {
    await complete(deps, job);
    return;
  }
  await svc.updateJob(deps.db, job, { progress: 30, current_step: "learning_rules" });
  const refs = new Map<string, { before?: string; after?: string; issue?: string }>();
  const inputHash = stableHash({ e: editVersions.map((v) => v.id), r: rejections.map((r) => r.id), t: templateHash(RULE_PROPOSER) });
  await runStep(deps, job, opts, { name: "propose", position: 1, inputHash }, async (stepId) => {
    const request = buildRuleProposalRequest({
      existingRules: existing,
      edits: edits.map((e, i) => {
        refs.set(`e${i + 1}`, { before: e.before, after: e.after });
        return { ref: `e${i + 1}`, before: e.before.slice(0, 600), after: e.after.slice(0, 600) };
      }),
      rejections: rejections.map((r, i) => {
        refs.set(`r${i + 1}`, { issue: r.issue });
        return { ref: `r${i + 1}`, issue: r.issue.slice(0, 300), rewrite: (r.rewrite.text ?? "").slice(0, 600) };
      }),
    });
    const templateId = await promptTemplateId(deps.db, userId, RULE_PROPOSER, "Propose voice rules from edits");
    const result = await deps.controller.generate(
      request,
      { userId, jobId: job.id, stepId, promptTemplateId: templateId },
      budgets(settings, job),
      settings.model_routes.rule_proposal,
    );
    const known = new Set(existing.map((r) => r.trim().toLowerCase()));
    const proposals = result.output.rules
      .filter((r) => r.rule.trim().length >= 5 && !known.has(r.rule.trim().toLowerCase()))
      .slice(0, 3)
      .map((r) => ({
        rule: r.rule,
        rationale: r.rationale,
        evidence: r.evidence_refs.map((ref) => refs.get(ref)).filter(Boolean) as unknown[],
        source: (r.evidence_refs.every((ref) => ref.startsWith("r")) ? "rejected_suggestions" : "edits") as "edits" | "rejected_suggestions",
      }))
      // Every rule must point at real evidence.
      .filter((r) => r.evidence.length > 0);
    const added = await svc.insertRuleProposals(deps.db, userId, brandId, proposals);
    await svc.markUsedForRules(deps.db, userId, editVersions.map((v) => v.id), rejections.map((r) => r.id));
    return { output: { proposed: added }, cost: result.costUsd };
  });
  await complete(deps, job);
}
