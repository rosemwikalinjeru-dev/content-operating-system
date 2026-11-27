/**
 * User-scoped research data access (RLS applies: every query runs as the signed-in owner).
 */
import { AppError, decodeCursor, encodeCursor, fromDatabaseError } from "@contentos/shared";
import type {
  CompetitorCreate,
  CompetitorRow,
  ManualSourcesImport,
  Page,
  ResearchFindings,
  ResearchQueryCreate,
  ResearchQueryRow,
} from "@contentos/schemas";
import type { UserClient } from "./client";

// ---------------------------------------------------------------------------
// Keywords (research_queries)
// ---------------------------------------------------------------------------

const QUERY_COLUMNS = "id, cluster_id, cluster_name, priority, kind, query, platforms, enabled, last_run_at";

export async function listResearchQueries(db: UserClient, brandId: string): Promise<ResearchQueryRow[]> {
  const { data, error } = await db
    .from("research_queries")
    .select(QUERY_COLUMNS)
    .eq("brand_id", brandId)
    .order("cluster_id")
    .order("kind")
    .order("query");
  if (error) throw fromDatabaseError(error);
  return data as ResearchQueryRow[];
}

/** Insert keywords, skipping ones that already exist (brand + kind + query). Returns the count added. */
export async function addResearchQueries(
  db: UserClient,
  userId: string,
  brandId: string,
  rows: Array<ResearchQueryCreate & { enabled?: boolean }>,
): Promise<number> {
  if (!rows.length) return 0;
  const { data, error } = await db
    .from("research_queries")
    .upsert(
      rows.map((r) => ({ ...r, user_id: userId, brand_id: brandId })),
      { onConflict: "brand_id,kind,query", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw fromDatabaseError(error);
  return (data ?? []).length;
}

export async function createResearchQuery(db: UserClient, userId: string, brandId: string, input: ResearchQueryCreate): Promise<ResearchQueryRow> {
  const { data, error } = await db
    .from("research_queries")
    .insert({ ...input, user_id: userId, brand_id: brandId })
    .select(QUERY_COLUMNS)
    .single();
  if (error) throw fromDatabaseError(error);
  return data as ResearchQueryRow;
}

export async function updateResearchQuery(
  db: UserClient,
  id: string,
  patch: Partial<Pick<ResearchQueryRow, "enabled" | "priority" | "platforms" | "query">>,
): Promise<ResearchQueryRow> {
  const { data, error } = await db.from("research_queries").update(patch).eq("id", id).select(QUERY_COLUMNS).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Keyword not found.");
  return data as ResearchQueryRow;
}

export async function deleteResearchQuery(db: UserClient, id: string): Promise<void> {
  const { data, error } = await db.from("research_queries").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Keyword not found.");
}

// ---------------------------------------------------------------------------
// Competitors
// ---------------------------------------------------------------------------

const COMPETITOR_COLUMNS = "id, name, platform, profile_url, relationship, priority, study_focus, enabled, last_collected_at";

export async function listCompetitors(db: UserClient, brandId: string): Promise<CompetitorRow[]> {
  const { data, error } = await db
    .from("competitors")
    .select(COMPETITOR_COLUMNS)
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("priority", { ascending: true, nullsFirst: false })
    .order("name");
  if (error) throw fromDatabaseError(error);
  return data as CompetitorRow[];
}

export async function createCompetitor(
  db: UserClient,
  userId: string,
  brandId: string,
  input: CompetitorCreate & { platform: string },
): Promise<CompetitorRow> {
  const { data, error } = await db
    .from("competitors")
    .insert({ ...input, user_id: userId, brand_id: brandId })
    .select(COMPETITOR_COLUMNS)
    .single();
  if (error) throw fromDatabaseError(error);
  return data as CompetitorRow;
}

/** Existing competitor profile URLs for a brand, including removed ones (unique constraint). */
export async function competitorUrls(db: UserClient, brandId: string): Promise<Set<string>> {
  const { data, error } = await db.from("competitors").select("profile_url").eq("brand_id", brandId);
  if (error) throw fromDatabaseError(error);
  return new Set((data as { profile_url: string }[]).map((r) => r.profile_url));
}

export async function updateCompetitor(
  db: UserClient,
  id: string,
  patch: Partial<Pick<CompetitorRow, "enabled" | "relationship" | "priority" | "study_focus">>,
): Promise<CompetitorRow> {
  const { data, error } = await db
    .from("competitors")
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null)
    .select(COMPETITOR_COLUMNS)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Competitor not found.");
  return data as CompetitorRow;
}

/** Soft delete: collected evidence keeps its link for traceability. */
export async function removeCompetitor(db: UserClient, id: string): Promise<void> {
  const { data, error } = await db
    .from("competitors")
    .update({ deleted_at: new Date().toISOString(), enabled: false })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Competitor not found.");
}

// ---------------------------------------------------------------------------
// Manual source import (owner-pasted posts)
// ---------------------------------------------------------------------------

export async function importManualSources(
  db: UserClient,
  userId: string,
  brandId: string,
  input: ManualSourcesImport,
  hash: (p: { platform: string; url: string | null; text: string }) => string,
  platform: string,
): Promise<{ imported: number; skipped: number }> {
  const rows = input.posts.map((p) => ({
    user_id: userId,
    brand_id: brandId,
    competitor_id: input.competitor_id ?? null,
    provider: "manual",
    platform,
    source_type: "post",
    source_url: p.url ?? null,
    author: p.author ?? null,
    content_text: p.text,
    published_at: p.published_at ?? null,
    metrics: { likes: p.likes ?? null, comments: p.comments ?? null, shares: p.shares ?? null, views: null },
    evidence: { observed: true, pasted_by_owner: true },
    content_hash: hash({ platform, url: p.url ?? null, text: p.text }),
  }));
  const unique = [...new Map(rows.map((r) => [r.content_hash, r])).values()];
  const { data, error } = await db
    .from("research_sources")
    .upsert(unique, { onConflict: "brand_id,content_hash", ignoreDuplicates: true })
    .select("id");
  if (error) throw fromDatabaseError(error);
  const imported = (data ?? []).length;
  return { imported, skipped: input.posts.length - imported };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface ResearchReportSummary {
  id: string;
  title: string;
  summary: string | null;
  report_type: string;
  job_id: string | null;
  created_at: string;
}

export interface ResearchReportDetail extends ResearchReportSummary {
  findings: ResearchFindings;
  ideas: Array<{ id: string; title: string; status: string }>;
}

export async function listResearchReports(db: UserClient, query: { limit: number; cursor?: string }): Promise<Page<ResearchReportSummary>> {
  let q = db
    .from("research_reports")
    .select("id, title, summary, report_type, job_id, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(query.limit + 1);
  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    q = q.or(`created_at.lt."${c.createdAt}",and(created_at.eq."${c.createdAt}",id.lt.${c.id})`);
  }
  const { data, error } = await q;
  if (error) throw fromDatabaseError(error);
  const rows = data as ResearchReportSummary[];
  const more = rows.length > query.limit;
  const page = more ? rows.slice(0, query.limit) : rows;
  const last = page.at(-1);
  return { data: page, next_cursor: more && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null };
}

const EMPTY_FINDINGS: ResearchFindings = {
  stats: { sources: 0, new_sources: 0, queries: 0, competitors: 0, credits: 0, labelled: 0 },
  outliers: [],
  gaps: [],
  idea_ids: [],
  notes: [],
};

export async function getResearchReport(db: UserClient, id: string): Promise<ResearchReportDetail> {
  const { data, error } = await db
    .from("research_reports")
    .select("id, title, summary, report_type, job_id, created_at, findings")
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Report not found.");
  const row = data as ResearchReportSummary & { findings: Partial<ResearchFindings> };
  const { data: ideas, error: ideaError } = await db
    .from("content_ideas")
    .select("id, title, status")
    .eq("research_report_id", id)
    .is("deleted_at", null)
    .order("created_at");
  if (ideaError) throw fromDatabaseError(ideaError);
  return { ...row, findings: { ...EMPTY_FINDINGS, ...row.findings }, ideas: ideas as ResearchReportDetail["ideas"] };
}

// ---------------------------------------------------------------------------
// Weekly schedule (monitoring_schedules, schedule_type = 'topic')
// ---------------------------------------------------------------------------

export interface ResearchSchedule {
  enabled: boolean;
  approved_at: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
}

export async function getResearchSchedule(db: UserClient, brandId: string): Promise<ResearchSchedule> {
  const { data, error } = await db
    .from("monitoring_schedules")
    .select("enabled, approved_at, next_run_at, last_run_at")
    .eq("brand_id", brandId)
    .eq("schedule_type", "topic")
    .is("competitor_id", null)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  return (data as ResearchSchedule | null) ?? { enabled: false, approved_at: null, next_run_at: null, last_run_at: null };
}

/**
 * Turn the weekly sweep on or off. Enabling is the owner's explicit approval, recorded in
 * approved_at; the first run is due in a week (run one now from the Research page).
 */
export async function setResearchSchedule(db: UserClient, userId: string, brandId: string, enabled: boolean): Promise<ResearchSchedule> {
  const now = new Date();
  const patch = enabled
    ? { enabled: true, approved_at: now.toISOString(), next_run_at: new Date(now.getTime() + 7 * 86_400_000).toISOString() }
    : { enabled: false };
  const { data: existing, error: findError } = await db
    .from("monitoring_schedules")
    .select("id")
    .eq("brand_id", brandId)
    .eq("schedule_type", "topic")
    .is("competitor_id", null)
    .maybeSingle();
  if (findError) throw fromDatabaseError(findError);
  const query = existing
    ? db.from("monitoring_schedules").update(patch).eq("id", (existing as { id: string }).id)
    : db.from("monitoring_schedules").insert({ user_id: userId, brand_id: brandId, schedule_type: "topic", frequency: "weekly", ...patch });
  const { data, error } = await query.select("enabled, approved_at, next_run_at, last_run_at").single();
  if (error) throw fromDatabaseError(error);
  return data as ResearchSchedule;
}

/** The most recent research job that is still queued or running (to resume its progress view). */
export async function activeResearchJobId(db: UserClient): Promise<string | null> {
  const { data, error } = await db
    .from("production_jobs")
    .select("id")
    .eq("job_type", "research_sweep")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  return (data as { id: string } | null)?.id ?? null;
}
