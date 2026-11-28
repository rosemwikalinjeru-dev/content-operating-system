/**
 * Worker-side data access for Phase 4 editorial review and learned rules (service role).
 * Every function filters by userId. Re-exported from `@contentos/database/service`.
 */
import { AppError, fromDatabaseError } from "@contentos/shared";
import type { ServiceClient } from "./service";

export interface VersionByIdRecord {
  id: string;
  asset_id: string;
  version: number;
  body: unknown;
  created_by: "ai" | "human";
}

export async function loadVersionById(db: ServiceClient, userId: string, versionId: string): Promise<VersionByIdRecord> {
  const { data, error } = await db
    .from("content_versions")
    .select("id, asset_id, version, body, created_by")
    .eq("id", versionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Version not found.");
  return data as VersionByIdRecord;
}

export async function loadApprovedRules(db: ServiceClient, userId: string, brandId: string): Promise<string[]> {
  const { data, error } = await db
    .from("learned_rules")
    .select("rule")
    .eq("user_id", userId)
    .eq("brand_id", brandId)
    .eq("status", "approved")
    .order("created_at");
  if (error) throw fromDatabaseError(error);
  return (data as { rule: string }[]).map((r) => r.rule);
}

/** Every rule the brand has (any status), so proposals never repeat one. */
export async function loadAllRules(db: ServiceClient, userId: string, brandId: string): Promise<string[]> {
  const { data, error } = await db.from("learned_rules").select("rule").eq("user_id", userId).eq("brand_id", brandId);
  if (error) throw fromDatabaseError(error);
  return (data as { rule: string }[]).map((r) => r.rule);
}

/** Approved content of other assets: the baseline for the repetition check. */
export async function loadApprovedBodies(db: ServiceClient, userId: string, excludeAssetId: string, limit = 100): Promise<unknown[]> {
  const { data, error } = await db
    .from("content_versions")
    .select("body")
    .eq("user_id", userId)
    .eq("status", "approved")
    .neq("asset_id", excludeAssetId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw fromDatabaseError(error);
  return (data as { body: unknown }[]).map((r) => r.body);
}

/** All verified knowledge text: numbers in a draft must come from here or the brief. */
export async function loadVerifiedKnowledgeText(db: ServiceClient, userId: string, brandId: string): Promise<string> {
  const { data, error } = await db
    .from("brand_knowledge")
    .select("title, body")
    .eq("user_id", userId)
    .eq("brand_id", brandId)
    .eq("verified", true)
    .is("deleted_at", null)
    .limit(500);
  if (error) throw fromDatabaseError(error);
  return (data as { title: string; body: string }[]).map((k) => `${k.title}\n${k.body}`).join("\n\n");
}

export async function insertReview(
  db: ServiceClient,
  userId: string,
  input: {
    assetId: string;
    version: number;
    versionId: string;
    jobId: string;
    promptTemplateId: string | null;
    provider: string;
    model: string;
    totalScore: number;
    dimensions: unknown;
    gateFailures: unknown[];
    repetition: unknown[];
    coldReader: unknown;
    issues: unknown[];
  },
): Promise<string> {
  const failed = input.gateFailures.length > 0;
  const { data, error } = await db
    .from("quality_reviews")
    .insert({
      user_id: userId,
      asset_id: input.assetId,
      version: input.version,
      version_id: input.versionId,
      job_id: input.jobId,
      prompt_template_id: input.promptTemplateId,
      reviewer_provider: input.provider,
      reviewer_model: input.model,
      total_score: input.totalScore,
      dimension_scores: input.dimensions,
      gate_failures: input.gateFailures,
      repetition: input.repetition,
      cold_reader: input.coldReader,
      issues: input.issues,
      factual_gate: failed ? "fail" : "pass",
      decision: failed ? "revise" : "pass",
    })
    .select("id")
    .single();
  if (error) throw fromDatabaseError(error);
  return (data as { id: string }).id;
}

export async function insertSuggestions(
  db: ServiceClient,
  userId: string,
  rows: Array<{ reviewId: string; assetId: string; versionId: string; sectionKey: string; dimension: string; issue: string; rewrite: unknown }>,
): Promise<void> {
  if (!rows.length) return;
  const { error } = await db.from("review_suggestions").insert(
    rows.map((r) => ({
      user_id: userId,
      review_id: r.reviewId,
      asset_id: r.assetId,
      version_id: r.versionId,
      section_key: r.sectionKey,
      dimension: r.dimension,
      issue: r.issue.slice(0, 1000),
      rewrite: r.rewrite,
    })),
  );
  if (error) throw fromDatabaseError(error);
}

// ---------------------------------------------------------------------------
// Learned rules
// ---------------------------------------------------------------------------

export async function loadUnusedEdits(
  db: ServiceClient,
  userId: string,
  limit = 20,
): Promise<Array<{ id: string; edits: Array<{ key: string; before: string; after: string }> }>> {
  const { data, error } = await db
    .from("content_versions")
    .select("id, body")
    .eq("user_id", userId)
    .eq("created_by", "human")
    .eq("used_for_rules", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw fromDatabaseError(error);
  return (data as Array<{ id: string; body: { edits?: Array<{ key: string; before: string; after: string }> } }>)
    .map((r) => ({ id: r.id, edits: r.body?.edits ?? [] }));
}

export async function loadUnusedRejections(
  db: ServiceClient,
  userId: string,
  limit = 20,
): Promise<Array<{ id: string; issue: string; rewrite: { text?: string } }>> {
  const { data, error } = await db
    .from("review_suggestions")
    .select("id, issue, rewrite")
    .eq("user_id", userId)
    .eq("status", "rejected")
    .eq("used_for_rules", false)
    .order("decided_at", { ascending: false })
    .limit(limit);
  if (error) throw fromDatabaseError(error);
  return data as Array<{ id: string; issue: string; rewrite: { text?: string } }>;
}

export async function markUsedForRules(db: ServiceClient, userId: string, versionIds: string[], suggestionIds: string[]): Promise<void> {
  if (versionIds.length) {
    const { error } = await db.from("content_versions").update({ used_for_rules: true }).eq("user_id", userId).in("id", versionIds);
    if (error) throw fromDatabaseError(error);
  }
  if (suggestionIds.length) {
    const { error } = await db.from("review_suggestions").update({ used_for_rules: true }).eq("user_id", userId).in("id", suggestionIds);
    if (error) throw fromDatabaseError(error);
  }
}

export async function insertRuleProposals(
  db: ServiceClient,
  userId: string,
  brandId: string,
  rules: Array<{ rule: string; rationale: string; evidence: unknown[]; source: "edits" | "rejected_suggestions" }>,
): Promise<number> {
  if (!rules.length) return 0;
  const { data, error } = await db
    .from("learned_rules")
    .upsert(
      rules.map((r) => ({ user_id: userId, brand_id: brandId, rule: r.rule.trim().slice(0, 300), rationale: r.rationale, evidence: r.evidence, source: r.source })),
      { onConflict: "brand_id,rule", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw fromDatabaseError(error);
  return (data ?? []).length;
}

/**
 * Recent written content outside one project (newest version per asset), for the
 * "do not repeat" list. Drafts count too: repeating an unpublished draft is still repetition.
 */
export async function loadRecentBodies(db: ServiceClient, userId: string, excludeProjectId: string | null, limit = 30): Promise<unknown[]> {
  let own: string[] = [];
  if (excludeProjectId) {
    const { data, error } = await db.from("content_assets").select("id").eq("user_id", userId).eq("project_id", excludeProjectId);
    if (error) throw fromDatabaseError(error);
    own = (data as { id: string }[]).map((r) => r.id);
  }
  const { data, error } = await db
    .from("content_versions")
    .select("asset_id, version, body")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw fromDatabaseError(error);
  const latest = new Map<string, unknown>();
  for (const r of data as Array<{ asset_id: string; body: unknown }>) {
    if (own.includes(r.asset_id) || latest.has(r.asset_id)) continue;
    latest.set(r.asset_id, r.body);
    if (latest.size >= limit) break;
  }
  return [...latest.values()];
}

/** Recently collected niche posts (research), for "what everyone is saying" and copy checks. */
export async function loadNicheCorpus(
  db: ServiceClient,
  userId: string,
  brandId: string,
  days = 60,
  limit = 150,
): Promise<Array<{ text: string; topic: string | null }>> {
  const { data, error } = await db
    .from("research_sources")
    .select("content_text, labels")
    .eq("user_id", userId)
    .eq("brand_id", brandId)
    .gte("collected_at", new Date(Date.now() - days * 86_400_000).toISOString())
    .order("collected_at", { ascending: false })
    .limit(limit);
  if (error) throw fromDatabaseError(error);
  return (data as Array<{ content_text: string | null; labels: { topic?: unknown } | null }>)
    .filter((r) => (r.content_text ?? "").length > 0)
    .map((r) => ({ text: r.content_text ?? "", topic: typeof r.labels?.topic === "string" ? r.labels.topic : null }));
}
