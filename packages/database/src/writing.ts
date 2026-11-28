/** User-scoped access to written content (RLS applies). */
import { AppError, fromDatabaseError } from "@contentos/shared";
import {
  FORMAT_ASSET,
  formatFromAsset,
  type ContentAssetView,
  type ContentVersionView,
  type DraftBody,
  readSourcePost,
  type LearnedRuleRow,
  type ReviewView,
} from "@contentos/schemas";
import type { UserClient } from "./client";

const VERSION_COLUMNS = "id, version, status, created_by, model, change_note, revised_section, parent_version, body, created_at";

export async function listProjectAssets(db: UserClient, projectId: string): Promise<ContentAssetView[]> {
  // A format whose first write failed has no versions; hide it so it can be added again.
  const assets = (await listProjectAssetsRaw(db, projectId)).filter((a) => a.versions.length > 0);
  const versionIds = assets.flatMap((a) => a.versions.map((v) => v.id));
  const reviews = await latestReviews(db, versionIds);
  for (const a of assets) for (const v of a.versions) v.review = reviews.get(v.id) ?? null;
  return assets;
}

async function listProjectAssetsRaw(db: UserClient, projectId: string): Promise<ContentAssetView[]> {
  const { data, error } = await db
    .from("content_assets")
    .select(`id, platform, format, status, current_version, approved_version, content_versions(${VERSION_COLUMNS})`)
    .eq("project_id", projectId)
    .is("deleted_at", null);
  if (error) throw fromDatabaseError(error);
  const rows = data as Array<{
    id: string;
    platform: string;
    format: string;
    status: string;
    current_version: number;
    approved_version: number | null;
    content_versions: ContentVersionView[];
  }>;
  return rows
    .map((r) => {
      const format = formatFromAsset(r.platform, r.format);
      if (!format) return null;
      return {
        id: r.id,
        format,
        label: FORMAT_ASSET[format].label,
        status: r.status,
        current_version: r.current_version,
        approved_version: r.approved_version,
        versions: [...r.content_versions].sort((a, b) => b.version - a.version),
      };
    })
    .filter((a): a is ContentAssetView => a !== null)
    .sort((a, b) => Object.keys(FORMAT_ASSET).indexOf(a.format) - Object.keys(FORMAT_ASSET).indexOf(b.format));
}

export interface AssetSummary {
  id: string;
  project_id: string;
  platform: string;
  format: string;
}

export async function getAsset(db: UserClient, id: string): Promise<AssetSummary> {
  const { data, error } = await db.from("content_assets").select("id, project_id, platform, format").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Content not found.");
  return data as AssetSummary;
}

export async function getAssetVersion(db: UserClient, assetId: string, version: number): Promise<ContentVersionView> {
  const { data, error } = await db.from("content_versions").select(VERSION_COLUMNS).eq("asset_id", assetId).eq("version", version).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Version not found.");
  return data as ContentVersionView;
}

export async function getVersionById(db: UserClient, id: string): Promise<ContentVersionView & { asset_id: string }> {
  const { data, error } = await db.from("content_versions").select(`${VERSION_COLUMNS}, asset_id`).eq("id", id).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Version not found.");
  return data as ContentVersionView & { asset_id: string };
}

export async function addHumanVersion(
  db: UserClient,
  input: { assetId: string; body: DraftBody; parentVersion: number; note: string | null },
): Promise<ContentVersionView> {
  const { data, error } = await db
    .rpc("add_content_version", {
      p_asset_id: input.assetId,
      p_body: input.body,
      p_created_by: "human",
      p_change_note: input.note,
      p_parent_version: input.parentVersion,
    })
    .single();
  if (error) {
    if (error.code === "P0002") throw new AppError("NOT_FOUND", "Content not found.");
    throw fromDatabaseError(error);
  }
  return data as ContentVersionView;
}

export async function approveContentVersion(db: UserClient, versionId: string): Promise<ContentVersionView> {
  const { data, error } = await db.rpc("approve_content_version", { p_version_id: versionId }).single();
  if (error) {
    if (error.code === "P0002") throw new AppError("NOT_FOUND", "Version not found.");
    if (error.code === "P0001") throw new AppError("CONFLICT", "This version cannot be approved.");
    throw fromDatabaseError(error);
  }
  return data as ContentVersionView;
}

/** The project's currently approved brief, if any. */
export async function approvedBriefId(db: UserClient, projectId: string): Promise<{ id: string; version: number } | null> {
  const { data, error } = await db
    .from("content_briefs")
    .select("id, version")
    .eq("project_id", projectId)
    .eq("approval_status", "approved")
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  return data as { id: string; version: number } | null;
}

/**
 * The newest writing job to show on the project page: one still running, or one that failed in the
 * last 24 hours (so its reason stays visible after a refresh).
 */
export async function activeWritingJob(db: UserClient, projectId: string): Promise<{ id: string; job_type: string } | null> {
  const { data, error } = await db
    .from("production_jobs")
    .select("id, job_type, status, created_at")
    .eq("project_id", projectId)
    .in("job_type", ["write_content", "revise_section", "review_version"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  const row = data as { id: string; job_type: string; status: string; created_at: string } | null;
  if (!row) return null;
  const recent = Date.now() - new Date(row.created_at).getTime() < 86_400_000;
  return row.status === "queued" || row.status === "running" || (row.status === "failed" && recent) ? { id: row.id, job_type: row.job_type } : null;
}

/** The latest review of each version, with its suggestions and the owner's gate overrides. */
export async function latestReviews(db: UserClient, versionIds: string[]): Promise<Map<string, ReviewView>> {
  const out = new Map<string, ReviewView>();
  if (!versionIds.length) return out;
  const [reviews, suggestions, overrides] = await Promise.all([
    db
      .from("quality_reviews")
      .select("id, version_id, total_score, dimension_scores, cold_reader, gate_failures, repetition, reviewer_model, created_at")
      .in("version_id", versionIds)
      .order("created_at", { ascending: false }),
    db
      .from("review_suggestions")
      .select("id, review_id, section_key, dimension, issue, rewrite, status, applied_version, created_at")
      .in("version_id", versionIds)
      .order("created_at"),
    db.from("gate_overrides").select("version_id, gate, reason").in("version_id", versionIds),
  ]);
  for (const r of [reviews, suggestions, overrides]) if (r.error) throw fromDatabaseError(r.error);
  for (const r of reviews.data as Array<Record<string, unknown> & { id: string; version_id: string }>) {
    if (out.has(r.version_id)) continue;
    out.set(r.version_id, {
      id: r.id,
      total_score: Number(r.total_score),
      dimensions: (r.dimension_scores as ReviewView["dimensions"]) ?? [],
      cold_reader: (r.cold_reader as ReviewView["cold_reader"]) ?? null,
      gate_failures: (r.gate_failures as ReviewView["gate_failures"]) ?? [],
      repetition: (r.repetition as ReviewView["repetition"]) ?? [],
      reviewer_model: (r.reviewer_model as string | null) ?? null,
      created_at: r.created_at as string,
      overrides: [],
      suggestions: [],
    });
  }
  const byReview = new Map([...out.values()].map((r) => [r.id, r]));
  for (const s of suggestions.data as Array<ReviewView["suggestions"][number] & { review_id: string }>) {
    const { review_id, ...rest } = s;
    byReview.get(review_id)?.suggestions.push(rest);
  }
  for (const o of overrides.data as Array<{ version_id: string; gate: string; reason: string }>) {
    out.get(o.version_id)?.overrides.push({ gate: o.gate, reason: o.reason });
  }
  return out;
}

export async function getSuggestion(
  db: UserClient,
  id: string,
): Promise<{ id: string; asset_id: string; version_id: string; section_key: string; issue: string; rewrite: ReviewView["suggestions"][number]["rewrite"]; status: string; reviewer_model: string | null }> {
  const { data, error } = await db
    .from("review_suggestions")
    .select("id, asset_id, version_id, section_key, issue, rewrite, status, quality_reviews(reviewer_model)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Suggestion not found.");
  const row = data as unknown as { quality_reviews: { reviewer_model: string | null } | null } & Record<string, unknown>;
  const { quality_reviews, ...rest } = row;
  return {
    ...(rest as { id: string; asset_id: string; version_id: string; section_key: string; issue: string; rewrite: ReviewView["suggestions"][number]["rewrite"]; status: string }),
    reviewer_model: quality_reviews?.reviewer_model ?? null,
  };
}

export async function decideSuggestion(db: UserClient, id: string, status: "accepted" | "rejected", appliedVersion: number | null): Promise<void> {
  const { data, error } = await db
    .from("review_suggestions")
    .update({ status, applied_version: appliedVersion, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("CONFLICT", "This suggestion was already decided.");
}

export async function addAiVersionFromSuggestion(
  db: UserClient,
  input: { assetId: string; body: DraftBody; parentVersion: number; section: string; note: string; model: string },
): Promise<ContentVersionView> {
  const { data, error } = await db
    .rpc("add_content_version", {
      p_asset_id: input.assetId,
      p_body: input.body,
      p_created_by: "ai",
      p_change_note: input.note.slice(0, 500),
      p_model: input.model,
      p_parent_version: input.parentVersion,
      p_revised_section: input.section,
    })
    .single();
  if (error) throw fromDatabaseError(error);
  return data as ContentVersionView;
}

export async function addGateOverride(db: UserClient, userId: string, versionId: string, gate: string, reason: string): Promise<void> {
  const { error } = await db.from("gate_overrides").insert({ user_id: userId, version_id: versionId, gate, reason });
  if (error) {
    if (error.code === "23505") throw new AppError("CONFLICT", "This gate is already overridden.");
    throw fromDatabaseError(error);
  }
}

export async function listGateOverrides(db: UserClient, versionId: string): Promise<string[]> {
  const { data, error } = await db.from("gate_overrides").select("gate").eq("version_id", versionId);
  if (error) throw fromDatabaseError(error);
  return (data as { gate: string }[]).map((g) => g.gate);
}

/** What the free checks need at approval time: brief JSON, verified knowledge and banned phrases. */
export async function gateSources(
  db: UserClient,
  assetId: string,
): Promise<{ briefText: string; knowledgeText: string; banned: string[]; approvedBodies: unknown[]; examplePosts: string[]; sourcePostText: string | null; nichePosts: string[] }> {
  const { data: asset, error } = await db
    .from("content_assets")
    .select("brief_id, content_projects(brand_id, content_ideas(metadata))")
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!asset) throw new AppError("NOT_FOUND", "Content not found.");
  const a = asset as unknown as { brief_id: string | null; content_projects: { brand_id: string; content_ideas: { metadata: unknown } | null } | null };
  const brandId = a.content_projects?.brand_id;
  const [brief, knowledge, brand, approved, examples, niche] = await Promise.all([
    a.brief_id ? db.from("content_briefs").select("brief").eq("id", a.brief_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    brandId
      ? db.from("brand_knowledge").select("title, body").eq("brand_id", brandId).eq("verified", true).is("deleted_at", null).limit(500)
      : Promise.resolve({ data: [], error: null }),
    brandId ? db.from("brand_profiles").select("voice_profile").eq("id", brandId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    db.from("content_versions").select("body").eq("status", "approved").neq("asset_id", assetId).order("created_at", { ascending: false }).limit(100),
    brandId
      ? db.from("brand_knowledge").select("body").eq("brand_id", brandId).eq("kind", "example_post").is("deleted_at", null).limit(50)
      : Promise.resolve({ data: [], error: null }),
    brandId
      ? db
          .from("research_sources")
          .select("content_text")
          .eq("brand_id", brandId)
          .gte("collected_at", new Date(Date.now() - 60 * 86_400_000).toISOString())
          .order("collected_at", { ascending: false })
          .limit(150)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [brief, knowledge, brand, approved, examples, niche]) if (r.error) throw fromDatabaseError(r.error);
  return {
    briefText: brief.data ? JSON.stringify((brief.data as { brief: unknown }).brief) : "",
    knowledgeText: ((knowledge.data ?? []) as { title: string; body: string }[]).map((k) => `${k.title}\n${k.body}`).join("\n\n"),
    banned: ((brand.data as { voice_profile?: { banned_phrases?: string[] } } | null)?.voice_profile?.banned_phrases ?? []).filter(Boolean),
    approvedBodies: ((approved.data ?? []) as { body: unknown }[]).map((r) => r.body),
    examplePosts: ((examples.data ?? []) as { body: string }[]).map((r) => r.body),
    sourcePostText: readSourcePost(a.content_projects?.content_ideas?.metadata)?.text ?? null,
    nichePosts: ((niche.data ?? []) as { content_text: string | null }[]).map((r) => r.content_text ?? "").filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// Learned rules
// ---------------------------------------------------------------------------

const RULE_COLUMNS = "id, rule, rationale, evidence, status, source, created_at";

export async function listLearnedRules(db: UserClient, brandId: string): Promise<LearnedRuleRow[]> {
  const { data, error } = await db.from("learned_rules").select(RULE_COLUMNS).eq("brand_id", brandId).order("created_at", { ascending: false });
  if (error) throw fromDatabaseError(error);
  return data as LearnedRuleRow[];
}

export async function createLearnedRule(db: UserClient, userId: string, brandId: string, rule: string): Promise<LearnedRuleRow> {
  const { data, error } = await db
    .from("learned_rules")
    .insert({ user_id: userId, brand_id: brandId, rule, source: "owner", status: "approved", decided_at: new Date().toISOString() })
    .select(RULE_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") throw new AppError("CONFLICT", "That rule already exists.");
    throw fromDatabaseError(error);
  }
  return data as LearnedRuleRow;
}

export async function setLearnedRuleStatus(db: UserClient, id: string, status: "approved" | "rejected" | "disabled"): Promise<LearnedRuleRow> {
  const { data, error } = await db
    .from("learned_rules")
    .update({ status, decided_at: new Date().toISOString() })
    .eq("id", id)
    .select(RULE_COLUMNS)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Rule not found.");
  return data as LearnedRuleRow;
}

export async function countUnusedRejections(db: UserClient): Promise<number> {
  const { count, error } = await db
    .from("review_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("status", "rejected")
    .eq("used_for_rules", false);
  if (error) throw fromDatabaseError(error);
  return count ?? 0;
}

export async function getLatestVersion(db: UserClient, assetId: string): Promise<ContentVersionView> {
  const { data, error } = await db
    .from("content_versions")
    .select(VERSION_COLUMNS)
    .eq("asset_id", assetId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Version not found.");
  return data as ContentVersionView;
}

/**
 * Which schema migrations this page needs are missing from the live database. Each probe reads
 * one column the migration adds; a "missing column/table" error means it has not been applied.
 */
export async function missingMigrations(db: UserClient): Promise<string[]> {
  const probes: Array<[string, () => PromiseLike<{ error: { code?: string } | null }>]> = [
    ["20261129000100_writing.sql", () => db.from("content_versions").select("revised_section").limit(1)],
    ["20261130000100_editorial.sql", () => db.from("quality_reviews").select("version_id").limit(1)],
    ["20261130000100_editorial.sql", () => db.from("gate_overrides").select("gate").limit(1)],
  ];
  const missing = new Set<string>();
  for (const [file, probe] of probes) {
    const { error } = await probe();
    if (error && ["42703", "42P01", "PGRST204", "PGRST205", "PGRST200"].includes(error.code ?? "")) missing.add(file);
  }
  return [...missing];
}
