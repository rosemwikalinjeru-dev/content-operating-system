/**
 * Research sweep pipeline (Phase 2): collect → label → analyse → ideas.
 *
 * - Collect: niche keyword searches (problem clusters, audience language) plus tracked
 *   competitor feeds, within a per-run ScrapeCreators credit cap. Manually imported competitor
 *   posts from the last 45 days count towards competitor coverage.
 * - Label: cheap model (Haiku 5.5 by default) in batches: topic, cluster, hook, question, audience, fit.
 * - Analyse: outliers against each author's own baseline (fallback: query baseline), gap scores,
 *   and a stored research report.
 * - Ideas: the top gaps become evidence-backed ideas in the Idea Inbox (source_type = research).
 *
 * Steps record input hashes, so a retried job does not re-collect or re-label.
 */
import * as svc from "@contentos/database/service";
import { buildGapIdeasRequest, buildIdeaScreenRequest, buildLabelRequest, type ClusterInfo, type GapForSynthesis } from "@contentos/intelligence";
import {
  contentHash,
  scoreGaps,
  scoreItems,
  ScrapeCreatorsError,
  SEARCH_ENDPOINTS,
  FEED_ENDPOINTS,
  platformFromUrl,
  STARTER_KEYWORDS,
  type AnalyzableItem,
  type ScrapeCreatorsClient,
  type LabelledPost,
  type ResearchItem,
  type ResearchPlatform,
} from "@contentos/research-engine";
import { ResearchRunRequest, type ResearchFindings } from "@contentos/schemas";
import { AppError } from "@contentos/shared";
import { NonRetryableJobError, runStep, stableHash, type PipelineDeps, type RunOptions } from "./pipeline";

export interface ResearchDeps extends PipelineDeps {
  scrapeCreators: () => ScrapeCreatorsClient;
}

const LABEL_BATCH = 25;
const MAX_IDEAS = 5;

interface CollectedSource {
  id: string;
  group: string;
  fromCompetitor: boolean;
}

interface CollectOutput extends Record<string, unknown> {
  sources: CollectedSource[];
  queryIds: string[];
  competitorIds: string[];
  credits: number;
  newSources: number;
  notes: string[];
}

function toInsert(item: ResearchItem, link: { queryId?: string; competitorId?: string; query?: string }): svc.SourceInsert {
  return {
    provider: "scrapecreators",
    platform: item.platform,
    source_url: item.url,
    source_type: "post",
    author: item.author,
    content_text: item.text,
    published_at: item.publishedAt,
    metrics: item.metrics,
    evidence: { raw_keys: item.rawKeys, external_id: item.externalId, query: link.query ?? null, observed: true },
    content_hash: contentHash(item),
    competitor_id: link.competitorId ?? null,
    query_id: link.queryId ?? null,
  };
}

async function recordCredits(deps: ResearchDeps, userId: string, jobId: string, credits: number, status: "success" | "error") {
  if (credits <= 0) return;
  await svc.insertUsage(deps.db, {
    user_id: userId,
    job_id: jobId,
    provider: "scrapecreators",
    model: "api",
    task_type: "research_collect",
    units: credits,
    unit_type: "credit",
    estimated_cost: 0,
    actual_cost: 0,
    status,
  });
}

export async function runResearchSweep(deps: ResearchDeps, jobId: string, opts: RunOptions): Promise<void> {
  const job = await svc.loadJob(deps.db, jobId);
  if (job.job_type !== "research_sweep") throw new NonRetryableJobError("INTERNAL", `Job ${jobId} is ${job.job_type}.`);
  if (job.status === "completed" || job.status === "cancelled") return;
  const input = ResearchRunRequest.safeParse(job.input);
  if (!input.success) throw new NonRetryableJobError("VALIDATION_FAILED", "Research job input is invalid.");
  try {
    await sweep(deps, job, input.data, opts);
  } catch (err) {
    // Failures outside a step (no keywords, nothing collected) still end the job with a reason.
    if (err instanceof NonRetryableJobError) {
      await svc.updateJob(deps.db, job, { status: "failed", error: { code: err.code, message: err.message }, completed_at: new Date().toISOString() });
    }
    throw err;
  }
}

async function sweep(deps: ResearchDeps, job: svc.JobRecord, run: ResearchRunRequest, opts: RunOptions): Promise<void> {
  const userId = job.user_id;
  await svc.updateJob(deps.db, job, { status: "running", started_at: new Date().toISOString(), progress: 5, current_step: "loading" });

  const brandId = await svc.defaultBrandId(deps.db, userId);
  const brand = await svc.loadBrand(deps.db, userId, brandId);
  const settings = await svc.loadSettings(deps.db, userId);
  const limits = { dailyUsd: settings.budget_daily_usd, monthlyUsd: settings.budget_monthly_usd, jobUsd: job.budget_limit_usd };
  const queries = await svc.loadQueriesForRun(deps.db, userId, brandId, { clusterIds: run.cluster_ids, max: run.max_queries });
  if (!queries.length) {
    throw new NonRetryableJobError("VALIDATION_FAILED", "No research keywords are enabled. Import or add keywords on the Research page.");
  }
  const competitors = run.include_competitors ? await svc.loadCompetitorsForRun(deps.db, userId, brandId, 4) : [];
  const day = new Date().toISOString().slice(0, 10);

  // ---- 1. Collect ----------------------------------------------------------
  await svc.updateJob(deps.db, job, { progress: 10, current_step: "collecting" });
  const collected = await runStepSafe<CollectOutput>(
    deps,
    job,
    opts,
    { name: "collect", position: 1, inputHash: stableHash({ q: queries.map((q) => q.id), c: competitors.map((c) => c.id), day, cap: run.max_credits }) },
    async () => {
      const client = deps.scrapeCreators();
      const notes: string[] = [];
      const inserts: Array<{ row: svc.SourceInsert; group: string; fromCompetitor: boolean }> = [];
      const usedQueries = new Set<string>();
      const usedCompetitors = new Set<string>();

      const spend = () => client.creditsUsed;
      try {
        outer: for (const q of queries) {
          for (const platform of q.platforms as ResearchPlatform[]) {
            if (!SEARCH_ENDPOINTS[platform]) continue;
            if (spend() >= run.max_credits) {
              notes.push(`Stopped collecting at the ${run.max_credits}-credit cap.`);
              break outer;
            }
            try {
              const res = await client.search(platform, q.query);
              usedQueries.add(q.id);
              for (const item of res.items.slice(0, 25)) {
                inserts.push({ row: toInsert(item, { queryId: q.id, query: q.query }), group: q.id, fromCompetitor: false });
              }
              if (res.items.length === 0) notes.push(`No results parsed for "${q.query}" on ${platform}.`);
            } catch (err) {
              if (err instanceof ScrapeCreatorsError && !err.retryable) throw err;
              notes.push(`Skipped "${q.query}" on ${platform}: ${(err as Error).message}`);
            }
          }
        }

        for (const c of competitors) {
          if (spend() >= run.max_credits) break;
          const platform = (platformFromUrl(c.profile_url) ?? c.platform) as ResearchPlatform;
          if (!FEED_ENDPOINTS[platform]) continue;
          try {
            const res = await client.feed(platform, c.profile_url);
            usedCompetitors.add(c.id);
            for (const item of res.items.slice(0, 30)) {
              inserts.push({ row: toInsert(item, { competitorId: c.id }), group: `c:${c.id}`, fromCompetitor: true });
            }
            if (res.items.length === 0) {
              notes.push(
                platform === "linkedin"
                  ? `LinkedIn returned no posts for ${c.name}; paste their posts in Research → Import posts.`
                  : `No posts parsed for ${c.name} on ${platform}.`,
              );
            }
          } catch (err) {
            if (err instanceof ScrapeCreatorsError && !err.retryable) throw err;
            notes.push(`Skipped ${c.name}: ${(err as Error).message}`);
          }
        }
      } finally {
        await recordCredits(deps, userId, job.id, client.creditsUsed, "success");
      }

      const { idsByHash, inserted } = await svc.upsertSources(deps.db, userId, brandId, job.id, inserts.map((i) => i.row));
      const sources: CollectedSource[] = [];
      const seen = new Set<string>();
      for (const i of inserts) {
        const id = idsByHash.get(i.row.content_hash);
        if (id && !seen.has(id)) {
          seen.add(id);
          sources.push({ id, group: i.group, fromCompetitor: i.fromCompetitor });
        }
      }
      for (const id of await svc.recentCompetitorSourceIds(deps.db, userId, brandId)) {
        if (!seen.has(id)) {
          seen.add(id);
          sources.push({ id, group: "c:manual", fromCompetitor: true });
        }
      }
      await svc.touchQueries(deps.db, userId, [...usedQueries]);
      await svc.touchCompetitors(deps.db, userId, [...usedCompetitors]);
      const output: CollectOutput = {
        sources,
        queryIds: [...usedQueries],
        competitorIds: [...usedCompetitors],
        credits: client.creditsUsed,
        newSources: inserted,
        notes,
      };
      return { output, cost: 0 };
    },
  );
  if (!collected.sources.length) {
    throw new NonRetryableJobError("NO_RESULTS", `Research found no posts. ${collected.notes.slice(0, 3).join(" ")}`.trim());
  }

  // ---- 2. Label ------------------------------------------------------------
  await svc.updateJob(deps.db, job, { progress: 40, current_step: "labelling" });
  const clusters: ClusterInfo[] = STARTER_KEYWORDS.clusters.map((c) => ({ id: c.id, name: c.name, concepts: c.concepts }));
  const labelled = await runStepSafe<{ labelled: number }>(
    deps,
    job,
    opts,
    { name: "label", position: 2, inputHash: stableHash(collected.sources.map((s) => s.id)) },
    async (stepId) => {
      const records = await svc.loadSources(deps.db, userId, collected.sources.map((s) => s.id));
      const todo = records.filter((r) => typeof r.labels?.topic !== "string" && (r.content_text ?? "").length > 0);
      let count = 0;
      let cost = 0;
      for (let i = 0; i < todo.length; i += LABEL_BATCH) {
        const batch = todo.slice(i, i + LABEL_BATCH);
        const refs = new Map(batch.map((r, n) => [`s${n + 1}`, r]));
        const req = buildLabelRequest(
          brand,
          clusters,
          [...refs].map(([ref, r]) => ({ ref, platform: r.platform ?? "unknown", text: r.content_text ?? "" })),
        );
        const result = await deps.controller.generate(req, { userId, jobId: job.id, stepId }, limits, settings.model_routes.research_labeling);
        cost += result.costUsd;
        for (const l of result.output.items) {
          const rec = refs.get(l.ref);
          if (!rec) continue;
          await svc.updateSource(deps.db, userId, rec.id, {
            labels: {
              topic: l.topic,
              cluster_id: l.cluster_id === "none" ? null : l.cluster_id,
              hook_pattern: l.hook_pattern,
              is_question: l.is_question,
              owner_audience: l.owner_audience,
              brand_fit: Math.max(0, Math.min(1, l.brand_fit)),
              labelled_by: result.model,
            },
          });
          count++;
        }
        await svc.updateJob(deps.db, job, { progress: Math.min(70, 40 + Math.round(((i + LABEL_BATCH) / todo.length) * 30)) });
      }
      return { output: { labelled: count }, cost };
    },
  );

  // ---- 3. Analyse ----------------------------------------------------------
  await svc.updateJob(deps.db, job, { progress: 72, current_step: "analysing" });
  const queryById = new Map(queries.map((q) => [q.id, q]));
  const analysis = await runStepSafe<{ reportId: string; gapCount: number; findings: ResearchFindings }>(
    deps,
    job,
    opts,
    { name: "analyse", position: 3, inputHash: stableHash({ s: collected.sources.map((s) => s.id), l: labelled.labelled }) },
    async () => {
      const records = await svc.loadSources(deps.db, userId, collected.sources.map((s) => s.id));
      const meta = new Map(collected.sources.map((s) => [s.id, s]));
      const items: Array<AnalyzableItem & { sourceId: string }> = records.map((r) => ({
        sourceId: r.id,
        platform: (r.platform ?? "reddit") as ResearchPlatform,
        externalId: null,
        url: r.source_url,
        text: r.content_text ?? "",
        author: r.author,
        publishedAt: null,
        metrics: {
          views: r.metrics?.views ?? null,
          likes: r.metrics?.likes ?? null,
          comments: r.metrics?.comments ?? null,
          shares: r.metrics?.shares ?? null,
        },
        rawKeys: [],
        group: meta.get(r.id)?.group ?? "none",
      }));
      const scored = scoreItems(items);
      const posts: LabelledPost[] = [];
      for (const s of scored) {
        const rec = records.find((r) => r.id === s.item.sourceId)!;
        await svc.updateSource(deps.db, userId, rec.id, {
          engagement: s.engagement,
          lift: s.lift,
          baseline_kind: s.baselineKind,
          outlier_tier: s.tier,
        });
        const labels = rec.labels ?? {};
        if (typeof labels.topic !== "string") continue;
        const query = rec.query_id ? queryById.get(rec.query_id) : undefined;
        posts.push({
          sourceId: rec.id,
          topic: labels.topic,
          clusterId: (labels.cluster_id as string | null) ?? query?.cluster_id ?? null,
          clusterPriority: query?.priority ?? null,
          lift: s.lift,
          tier: s.tier,
          isQuestion: labels.is_question === true,
          ownerAudience: labels.owner_audience !== false,
          brandFit: typeof labels.brand_fit === "number" ? labels.brand_fit : 0.5,
          fromCompetitor: meta.get(rec.id)?.fromCompetitor ?? false,
        });
      }
      const gaps = scoreGaps(posts, { limit: 10 });
      const outliers = scored
        .filter((s) => s.tier !== "none")
        .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))
        .slice(0, 20)
        .map((s) => {
          const rec = records.find((r) => r.id === s.item.sourceId)!;
          return {
            source_id: rec.id,
            platform: s.item.platform,
            url: rec.source_url,
            author: rec.author,
            excerpt: (rec.content_text ?? "").slice(0, 240),
            topic: typeof rec.labels?.topic === "string" ? rec.labels.topic : null,
            lift: s.lift,
            tier: s.tier,
            baseline_kind: s.baselineKind,
            confidence: s.confidence,
            from_competitor: meta.get(rec.id)?.fromCompetitor ?? false,
          };
        });
      const findings: ResearchFindings = {
        stats: {
          sources: collected.sources.length,
          new_sources: collected.newSources,
          queries: collected.queryIds.length,
          competitors: collected.competitorIds.length,
          credits: collected.credits,
          labelled: labelled.labelled,
        },
        outliers,
        gaps: gaps.map((g) => ({
          topic: g.topic,
          cluster_id: g.clusterId,
          score: g.score,
          outlier_strength: g.outlierStrength,
          competitor_coverage: g.competitorCoverage,
          brand_fit: g.brandFit,
          question_count: g.questionCount,
          outlier_count: g.outlierCount,
          evidence_ids: g.evidenceIds,
          evidence: g.evidenceIds.slice(0, 5).map((sid) => {
            const rec = records.find((r) => r.id === sid);
            const sc = scored.find((x) => x.item.sourceId === sid);
            return {
              source_id: sid,
              platform: rec?.platform ?? "unknown",
              url: rec?.source_url ?? null,
              excerpt: (rec?.content_text ?? "").slice(0, 200),
              lift: sc?.lift ?? null,
            };
          }),
        })),
        idea_ids: [],
        notes: collected.notes,
      };
      const reportId = await svc.insertResearchReport(deps.db, userId, {
        brandId,
        jobId: job.id,
        title: `Research sweep · ${day}`,
        summary: `${findings.stats.sources} posts, ${outliers.length} outliers, ${gaps.length} gaps.`,
        findings: findings as unknown as Record<string, unknown>,
        sourceIds: collected.sources.map((s) => s.id),
      });
      return { output: { reportId, gapCount: gaps.length, findings }, cost: 0 };
    },
  );

  // ---- 4. Ideas ------------------------------------------------------------
  await svc.updateJob(deps.db, job, { progress: 85, current_step: "creating_ideas" });
  await runStepSafe<{ ideaIds: string[] }>(
    deps,
    job,
    opts,
    { name: "ideas", position: 4, inputHash: stableHash({ r: analysis.reportId }) },
    async (stepId) => {
      const findings = analysis.findings;
      const top = findings.gaps.slice(0, MAX_IDEAS);
      if (!top.length) {
        return { output: { ideaIds: [] }, cost: 0 };
      }
      const evidenceRecords = await svc.loadSources(deps.db, userId, [...new Set(top.flatMap((g) => g.evidence_ids))]);
      const byId = new Map(evidenceRecords.map((r) => [r.id, r]));
      const refToSource = new Map<string, string>();
      let refN = 0;
      const clusterName = (id: string | null) => STARTER_KEYWORDS.clusters.find((c) => c.id === id)?.name ?? null;
      const gapInputs: GapForSynthesis[] = top.map((g) => ({
        topic: g.topic,
        clusterName: clusterName(g.cluster_id),
        score: g.score,
        competitorCoverage: g.competitor_coverage,
        questionCount: g.question_count,
        outlierCount: g.outlier_count,
        evidence: g.evidence_ids
          .map((id) => byId.get(id))
          .filter((r): r is svc.SourceRecord => Boolean(r))
          .slice(0, 5)
          .map((r) => {
            const ref = `e${++refN}`;
            refToSource.set(ref, r.id);
            return {
              ref,
              platform: r.platform ?? "unknown",
              lift: findings.outliers.find((o) => o.source_id === r.id)?.lift ?? null,
              isQuestion: r.labels?.is_question === true,
              excerpt: r.content_text ?? "",
            };
          }),
      }));
      const result = await deps.controller.generate(
        buildGapIdeasRequest(brand, gapInputs),
        { userId, jobId: job.id, stepId },
        limits,
        settings.model_routes.gap_synthesis,
      );
      // Independent genericity screen (the Idea Analyst's test): generic candidates never reach the Inbox.
      const candidates = result.output.ideas.filter((idea) => idea.title.trim() && idea.raw_input.trim());
      let screenCost = 0;
      let verdicts = new Map<number, { is_generic: boolean; reason: string }>();
      if (candidates.length) {
        const screen = await deps.controller.generate(
          buildIdeaScreenRequest(
            brand,
            candidates.map((c, n) => ({ ref: `i${n + 1}`, title: c.title, specific_moment: c.specific_moment, non_obvious_claim: c.non_obvious_claim, raw_input: c.raw_input })),
          ),
          { userId, jobId: job.id, stepId },
          limits,
          settings.model_routes.idea_screening,
        );
        screenCost = screen.costUsd;
        verdicts = new Map(
          screen.output.results
            .map((r) => [Number(r.ref.replace(/^i/, "")) - 1, { is_generic: r.is_generic, reason: r.reason }] as const)
            .filter(([n]) => Number.isInteger(n) && n >= 0 && n < candidates.length),
        );
      }
      // An idea the screen did not return a verdict for is treated as unscreened and kept out.
      const passed = candidates.filter((_, n) => verdicts.get(n)?.is_generic === false);
      const rejected = candidates
        .map((c, n) => ({ c, v: verdicts.get(n) }))
        .filter(({ v }) => !v || v.is_generic)
        .map(({ c, v }) => ({ title: c.title, gap_topic: c.gap_topic, reason: v?.reason ?? "Not screened." }));
      // At most one idea per gap first, then second candidates, up to MAX_IDEAS.
      const seenGaps = new Set<string>();
      const firsts = passed.filter((c) => !seenGaps.has(c.gap_topic) && seenGaps.add(c.gap_topic));
      const chosen = [...firsts, ...passed.filter((c) => !firsts.includes(c))].slice(0, MAX_IDEAS);

      const ideas = chosen.map((idea) => {
        const gap = top.find((g) => g.topic === idea.gap_topic) ?? top[0]!;
        const evidence = idea.evidence_refs
          .map((ref) => refToSource.get(ref))
          .filter((id): id is string => Boolean(id))
          .map((id) => byId.get(id))
          .filter((r): r is svc.SourceRecord => Boolean(r))
          .map((r) => ({
            source_id: r.id,
            platform: r.platform,
            url: r.source_url,
            lift: findings.outliers.find((o) => o.source_id === r.id)?.lift ?? null,
            is_question: r.labels?.is_question === true,
          }));
        const verdict = verdicts.get(candidates.indexOf(idea));
        return {
          title: idea.title,
          raw_input: [
            idea.raw_input,
            `The moment: ${idea.specific_moment}`,
            `My claim: ${idea.non_obvious_claim}`,
            `Not this (the generic version): ${idea.generic_version}`,
            `Why this is a gap: ${idea.why_gap}`,
          ].join("\n\n"),
          tags: ["research", gap.cluster_id ? `cluster-${gap.cluster_id.toLowerCase()}` : "research-gap"],
          metadata: {
            research: {
              report_id: analysis.reportId,
              gap: { topic: gap.topic, score: gap.score, competitor_coverage: gap.competitor_coverage, question_count: gap.question_count },
              angle: idea.angle,
              funnel_stage: idea.funnel_stage,
              specific_moment: idea.specific_moment,
              non_obvious_claim: idea.non_obvious_claim,
              screen: { is_generic: false, reason: verdict?.reason ?? null },
              evidence,
              generated_by: result.model,
              observed_vs_interpretation: "evidence = observed public posts; moment, claim, angle and why_gap = model interpretation",
            },
          },
        };
      });
      const ideaIds = await svc.insertResearchIdeas(deps.db, userId, brandId, analysis.reportId, ideas);
      const notes = [...findings.notes];
      if (rejected.length) notes.push(`${rejected.length} candidate idea(s) were kept out of the Inbox as generic.`);
      await svc.updateReportFindings(deps.db, userId, analysis.reportId, {
        ...findings,
        idea_ids: ideaIds,
        rejected_ideas: rejected,
        notes,
      } as unknown as Record<string, unknown>);
      return { output: { ideaIds }, cost: result.costUsd + screenCost };
    },
  );

  const actual = await svc.sumSpend(deps.db, { userId, jobId: job.id });
  await svc.updateJob(deps.db, job, {
    status: "completed",
    progress: 100,
    current_step: "done",
    error: null,
    actual_cost: actual,
    completed_at: new Date().toISOString(),
  });
}

/** Step runner that turns ScrapeCreators failures into job errors the runner understands. */
async function runStepSafe<T extends Record<string, unknown>>(
  deps: ResearchDeps,
  job: svc.JobRecord,
  opts: RunOptions,
  step: { name: string; position: number; inputHash: string },
  work: (stepId: string) => Promise<{ output: T; cost: number }>,
): Promise<T> {
  return runStep(deps, job, opts, step, async (stepId) => {
    try {
      return await work(stepId);
    } catch (err) {
      if (err instanceof ScrapeCreatorsError) {
        if (!err.retryable) throw new NonRetryableJobError("RESEARCH_PROVIDER", err.message);
        throw new AppError("SERVICE_UNAVAILABLE", err.message);
      }
      throw err;
    }
  });
}
