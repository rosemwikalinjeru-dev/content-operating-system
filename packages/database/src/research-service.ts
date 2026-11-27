/**
 * Worker-side research data access (service role). Every function filters by userId.
 * Re-exported from `@contentos/database/service`.
 */
import { AppError, fromDatabaseError } from "@contentos/shared";
import type { ServiceClient } from "./service";

export interface QueryRecord {
  id: string;
  cluster_id: string;
  cluster_name: string;
  priority: "high" | "medium" | "benchmark";
  kind: string;
  query: string;
  platforms: string[];
}

const PRIORITY_ORDER = { high: 0, medium: 1, benchmark: 2 } as const;

/**
 * Enabled queries for a run, high priority first, least recently run first, capped.
 * One saturation-benchmark query is included when available so coverage can be compared.
 */
export async function loadQueriesForRun(
  db: ServiceClient,
  userId: string,
  brandId: string,
  opts: { clusterIds?: string[]; max: number },
): Promise<QueryRecord[]> {
  let q = db
    .from("research_queries")
    .select("id, cluster_id, cluster_name, priority, kind, query, platforms, last_run_at")
    .eq("user_id", userId)
    .eq("brand_id", brandId)
    .eq("enabled", true);
  if (opts.clusterIds?.length) q = q.in("cluster_id", opts.clusterIds);
  const { data, error } = await q;
  if (error) throw fromDatabaseError(error);
  const rows = (data as Array<QueryRecord & { last_run_at: string | null }>).sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      (a.last_run_at ?? "").localeCompare(b.last_run_at ?? ""),
  );
  const main = rows.filter((r) => r.priority !== "benchmark").slice(0, Math.max(1, opts.max - 1));
  const benchmark = rows.find((r) => r.priority === "benchmark");
  return benchmark && main.length < opts.max ? [...main, benchmark] : main.slice(0, opts.max);
}

export interface CompetitorRecord {
  id: string;
  name: string;
  platform: string;
  profile_url: string;
  relationship: string;
}

export async function loadCompetitorsForRun(db: ServiceClient, userId: string, brandId: string, max: number): Promise<CompetitorRecord[]> {
  const { data, error } = await db
    .from("competitors")
    .select("id, name, platform, profile_url, relationship")
    .eq("user_id", userId)
    .eq("brand_id", brandId)
    .eq("enabled", true)
    .is("deleted_at", null)
    .order("last_collected_at", { ascending: true, nullsFirst: true })
    .limit(max);
  if (error) throw fromDatabaseError(error);
  return data as CompetitorRecord[];
}

export interface SourceInsert {
  provider: string;
  platform: string;
  source_url: string | null;
  source_type: string;
  author: string | null;
  content_text: string;
  published_at: string | null;
  metrics: Record<string, number | null>;
  evidence: Record<string, unknown>;
  content_hash: string;
  competitor_id: string | null;
  query_id: string | null;
}

/**
 * Store sources, skipping ones already collected (unique brand + content hash), and return the
 * ids of all of them — new and existing — keyed by content hash.
 */
export async function upsertSources(
  db: ServiceClient,
  userId: string,
  brandId: string,
  jobId: string,
  rows: SourceInsert[],
): Promise<{ idsByHash: Map<string, string>; inserted: number }> {
  if (!rows.length) return { idsByHash: new Map(), inserted: 0 };
  const unique = [...new Map(rows.map((r) => [r.content_hash, r])).values()];
  const { data: insertedRows, error } = await db
    .from("research_sources")
    .upsert(
      unique.map((r) => ({ ...r, user_id: userId, brand_id: brandId, job_id: jobId })),
      { onConflict: "brand_id,content_hash", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw fromDatabaseError(error);
  const { data, error: selectError } = await db
    .from("research_sources")
    .select("id, content_hash")
    .eq("user_id", userId)
    .eq("brand_id", brandId)
    .in("content_hash", unique.map((r) => r.content_hash));
  if (selectError) throw fromDatabaseError(selectError);
  return {
    idsByHash: new Map((data as { id: string; content_hash: string }[]).map((r) => [r.content_hash, r.id])),
    inserted: (insertedRows ?? []).length,
  };
}

export interface SourceRecord {
  id: string;
  platform: string | null;
  source_url: string | null;
  author: string | null;
  content_text: string | null;
  metrics: Record<string, number | null>;
  labels: Record<string, unknown>;
  competitor_id: string | null;
  query_id: string | null;
}

export async function loadSources(db: ServiceClient, userId: string, ids: string[]): Promise<SourceRecord[]> {
  if (!ids.length) return [];
  const out: SourceRecord[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from("research_sources")
      .select("id, platform, source_url, author, content_text, metrics, labels, competitor_id, query_id")
      .eq("user_id", userId)
      .in("id", ids.slice(i, i + 200));
    if (error) throw fromDatabaseError(error);
    out.push(...(data as SourceRecord[]));
  }
  return out;
}

/** Manually imported competitor posts from the last N days (for coverage). */
export async function recentCompetitorSourceIds(db: ServiceClient, userId: string, brandId: string, days = 45): Promise<string[]> {
  const { data, error } = await db
    .from("research_sources")
    .select("id")
    .eq("user_id", userId)
    .eq("brand_id", brandId)
    .not("competitor_id", "is", null)
    .gte("collected_at", new Date(Date.now() - days * 86_400_000).toISOString())
    .limit(300);
  if (error) throw fromDatabaseError(error);
  return (data as { id: string }[]).map((r) => r.id);
}

export async function updateSource(
  db: ServiceClient,
  userId: string,
  id: string,
  patch: Partial<{ labels: Record<string, unknown>; engagement: number | null; lift: number | null; baseline_kind: string; outlier_tier: string }>,
): Promise<void> {
  const { error } = await db.from("research_sources").update(patch).eq("id", id).eq("user_id", userId);
  if (error) throw fromDatabaseError(error);
}

export async function touchQueries(db: ServiceClient, userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await db.from("research_queries").update({ last_run_at: new Date().toISOString() }).eq("user_id", userId).in("id", ids);
  if (error) throw fromDatabaseError(error);
}

export async function touchCompetitors(db: ServiceClient, userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await db.from("competitors").update({ last_collected_at: new Date().toISOString() }).eq("user_id", userId).in("id", ids);
  if (error) throw fromDatabaseError(error);
}

export async function insertResearchReport(
  db: ServiceClient,
  userId: string,
  input: { brandId: string; jobId: string; title: string; summary: string; findings: Record<string, unknown>; sourceIds: string[] },
): Promise<string> {
  const { data, error } = await db
    .from("research_reports")
    .insert({
      user_id: userId,
      brand_id: input.brandId,
      job_id: input.jobId,
      report_type: "outliers",
      title: input.title,
      summary: input.summary,
      findings: input.findings,
      status: "final",
      period_end: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw fromDatabaseError(error);
  const reportId = (data as { id: string }).id;
  const links = [...new Set(input.sourceIds)].map((source_id) => ({ report_id: reportId, source_id, user_id: userId }));
  for (let i = 0; i < links.length; i += 500) {
    const { error: linkError } = await db.from("research_report_sources").insert(links.slice(i, i + 500));
    if (linkError) throw fromDatabaseError(linkError);
  }
  return reportId;
}

export async function updateReportFindings(db: ServiceClient, userId: string, reportId: string, findings: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("research_reports").update({ findings }).eq("id", reportId).eq("user_id", userId);
  if (error) throw fromDatabaseError(error);
}

export async function insertResearchIdeas(
  db: ServiceClient,
  userId: string,
  brandId: string,
  reportId: string,
  ideas: Array<{ title: string; raw_input: string; tags: string[]; metadata: Record<string, unknown> }>,
): Promise<string[]> {
  if (!ideas.length) return [];
  const { data, error } = await db
    .from("content_ideas")
    .insert(
      ideas.map((i) => ({
        user_id: userId,
        brand_id: brandId,
        research_report_id: reportId,
        title: i.title.slice(0, 200),
        raw_input: i.raw_input.slice(0, 20000),
        source_type: "research",
        status: "inbox",
        tags: i.tags.slice(0, 20),
        metadata: i.metadata,
      })),
    )
    .select("id");
  if (error) throw fromDatabaseError(error);
  return (data as { id: string }[]).map((r) => r.id);
}

/** The user's default brand id (research jobs run against it). */
export async function defaultBrandId(db: ServiceClient, userId: string): Promise<string> {
  const { data, error } = await db
    .from("brand_profiles")
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "No default brand.");
  return (data as { id: string }).id;
}

// ---------------------------------------------------------------------------
// Scheduling (cron)
// ---------------------------------------------------------------------------

export interface DueSchedule {
  id: string;
  user_id: string;
  brand_id: string;
  settings: Record<string, unknown>;
}

export async function dueResearchSchedules(db: ServiceClient, now = new Date()): Promise<DueSchedule[]> {
  const { data, error } = await db
    .from("monitoring_schedules")
    .select("id, user_id, brand_id, settings")
    .eq("schedule_type", "topic")
    .eq("enabled", true)
    .not("approved_at", "is", null)
    .lte("next_run_at", now.toISOString());
  if (error) throw fromDatabaseError(error);
  return data as DueSchedule[];
}

export async function advanceSchedule(db: ServiceClient, scheduleId: string, frequencyDays = 7): Promise<void> {
  const next = new Date(Date.now() + frequencyDays * 86_400_000).toISOString();
  const { error } = await db
    .from("monitoring_schedules")
    .update({ last_run_at: new Date().toISOString(), next_run_at: next })
    .eq("id", scheduleId);
  if (error) throw fromDatabaseError(error);
}

/** Create a job row as the service role (cron has no user session). Idempotent per key. */
export async function createJobAsService(
  db: ServiceClient,
  userId: string,
  input: { jobType: string; idempotencyKey: string; input: Record<string, unknown> },
): Promise<{ id: string; created: boolean }> {
  const { data, error } = await db
    .from("production_jobs")
    .insert({ user_id: userId, job_type: input.jobType, idempotency_key: input.idempotencyKey, input: input.input, current_step: "queued" })
    .select("id")
    .single();
  if (!error) return { id: (data as { id: string }).id, created: true };
  if (error.code !== "23505") throw fromDatabaseError(error);
  const existing = await db.from("production_jobs").select("id").eq("user_id", userId).eq("idempotency_key", input.idempotencyKey).single();
  if (existing.error) throw fromDatabaseError(existing.error);
  return { id: (existing.data as { id: string }).id, created: false };
}
