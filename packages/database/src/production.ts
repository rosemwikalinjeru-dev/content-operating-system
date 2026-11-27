import { AppError, fromDatabaseError } from "@contentos/shared";
import type { ContentFormat, JobType, JobView, MasterBrief, SettingsUpdate, UserSettings } from "@contentos/schemas";
import type { UserClient } from "./client";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const SETTINGS_COLUMNS = "budget_text_project_usd, budget_media_project_usd, budget_daily_usd, budget_monthly_usd";

function toSettings(row: Record<string, unknown>): UserSettings {
  return {
    budget_text_project_usd: Number(row.budget_text_project_usd),
    budget_media_project_usd: Number(row.budget_media_project_usd),
    budget_daily_usd: Number(row.budget_daily_usd),
    budget_monthly_usd: Number(row.budget_monthly_usd),
  };
}

export async function getSettings(db: UserClient): Promise<UserSettings> {
  const { data, error } = await db.from("user_settings").select(SETTINGS_COLUMNS).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Settings not found.");
  return toSettings(data);
}

export async function updateSettings(db: UserClient, userId: string, input: SettingsUpdate): Promise<UserSettings> {
  const { data, error } = await db.from("user_settings").update(input).eq("user_id", userId).select(SETTINGS_COLUMNS).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Settings not found.");
  return toSettings(data);
}

// ---------------------------------------------------------------------------
// Ideas: analysis view
// ---------------------------------------------------------------------------

export interface IdeaWithAnalysis {
  id: string;
  brand_id: string;
  title: string;
  raw_input: string;
  status: string;
  tags: string[];
  analysis: unknown;
  analysis_input_hash: string | null;
  analyzed_at: string | null;
  created_at: string;
}

export async function getIdeaWithAnalysis(db: UserClient, id: string): Promise<IdeaWithAnalysis> {
  const { data, error } = await db
    .from("content_ideas")
    .select("id, brand_id, title, raw_input, status, tags, analysis, analysis_input_hash, analyzed_at, created_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Idea not found.");
  return data as IdeaWithAnalysis;
}

// ---------------------------------------------------------------------------
// Projects and briefs
// ---------------------------------------------------------------------------

export interface BriefRow {
  id: string;
  version: number;
  brief: MasterBrief;
  approval_status: "pending" | "approved" | "rejected" | "superseded";
  approved_at: string | null;
  model: string | null;
  created_at: string;
}

export interface ProjectView {
  id: string;
  brand_id: string;
  idea_id: string | null;
  title: string;
  status: string;
  settings: { formats?: ContentFormat[] };
  created_at: string;
  briefs: BriefRow[];
}

const PROJECT_COLUMNS =
  "id, brand_id, idea_id, title, status, settings, created_at, content_briefs(id, version, brief, approval_status, approved_at, model, created_at)";

export async function createProject(
  db: UserClient,
  userId: string,
  input: { brandId: string; ideaId: string; title: string; formats: ContentFormat[] },
): Promise<ProjectView> {
  const { data, error } = await db
    .from("content_projects")
    .insert({
      user_id: userId,
      brand_id: input.brandId,
      idea_id: input.ideaId,
      title: input.title,
      production_mode: "idea_to_content",
      settings: { formats: input.formats },
    })
    .select(PROJECT_COLUMNS)
    .single();
  if (error) throw fromDatabaseError(error);
  return toProject(data);
}

export async function getProject(db: UserClient, id: string): Promise<ProjectView> {
  const { data, error } = await db.from("content_projects").select(PROJECT_COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Project not found.");
  return toProject(data);
}

export async function listProjects(db: UserClient, limit = 50): Promise<ProjectView[]> {
  const { data, error } = await db
    .from("content_projects")
    .select(PROJECT_COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw fromDatabaseError(error);
  return (data as unknown[]).map(toProject);
}

function toProject(row: unknown): ProjectView {
  const r = row as Omit<ProjectView, "briefs"> & { content_briefs: BriefRow[] | null };
  const { content_briefs, ...rest } = r;
  return { ...rest, briefs: [...(content_briefs ?? [])].sort((a, b) => b.version - a.version) };
}

export async function approveBrief(db: UserClient, briefId: string): Promise<BriefRow> {
  const { data, error } = await db.rpc("approve_brief", { p_brief_id: briefId });
  if (error) {
    if (error.code === "P0002") throw new AppError("NOT_FOUND", "Brief not found.");
    if (error.code === "P0001") throw new AppError("CONFLICT", "Only a pending brief can be approved.");
    throw fromDatabaseError(error);
  }
  return data as BriefRow;
}

export async function rejectBrief(db: UserClient, briefId: string): Promise<void> {
  const { data, error } = await db
    .from("content_briefs")
    .update({ approval_status: "rejected" })
    .eq("id", briefId)
    .eq("approval_status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("CONFLICT", "Only a pending brief can be rejected.");
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export interface CreatedJob {
  id: string;
  status: string;
  created: boolean;
}

/**
 * Create a job, or return the existing one for the same idempotency key. Duplicate submissions
 * (double clicks, retries) therefore never start a second paid run.
 */
export async function createJob(
  db: UserClient,
  userId: string,
  input: { jobType: JobType; idempotencyKey: string; projectId?: string | null; input: Record<string, unknown>; budgetUsd?: number | null },
): Promise<CreatedJob> {
  const { data, error } = await db
    .from("production_jobs")
    .insert({
      user_id: userId,
      job_type: input.jobType,
      idempotency_key: input.idempotencyKey,
      project_id: input.projectId ?? null,
      input: input.input,
      budget_limit_usd: input.budgetUsd ?? null,
      current_step: "queued",
    })
    .select("id, status")
    .single();
  if (!error) return { ...(data as { id: string; status: string }), created: true };
  if (error.code !== "23505") throw fromDatabaseError(error);

  const existing = await db
    .from("production_jobs")
    .select("id, status")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing.error || !existing.data) throw fromDatabaseError(existing.error);
  return { ...(existing.data as { id: string; status: string }), created: false };
}

export async function setJobOrchestratorRun(db: UserClient, jobId: string, runId: string): Promise<void> {
  const { error } = await db.from("production_jobs").update({ orchestrator_run_id: runId }).eq("id", jobId);
  if (error) throw fromDatabaseError(error);
}

export async function failJobToStart(db: UserClient, jobId: string, message: string): Promise<void> {
  await db
    .from("production_jobs")
    .update({ status: "failed", error: { code: "SERVICE_UNAVAILABLE", message }, completed_at: new Date().toISOString() })
    .eq("id", jobId);
}

export async function getJobView(db: UserClient, id: string): Promise<JobView> {
  const { data, error } = await db
    .from("production_jobs")
    .select(
      "id, job_type, status, progress, current_step, error, estimated_cost, actual_cost, input, created_at, completed_at, job_steps(name, status, position, output)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Job not found.");
  const row = data as {
    id: string;
    job_type: string;
    status: JobView["status"];
    progress: number;
    current_step: string | null;
    error: { code?: string; message?: string } | null;
    estimated_cost: number | null;
    actual_cost: number;
    created_at: string;
    completed_at: string | null;
    job_steps: Array<{ name: string; status: string; position: number; output: Record<string, unknown> | null }> | null;
  };
  const steps = [...(row.job_steps ?? [])].sort((a, b) => a.position - b.position);
  return {
    job_id: row.id,
    job_type: row.job_type,
    status: row.status,
    progress: row.progress,
    current_step: row.current_step,
    steps: steps.map((s) => ({ name: s.name, status: s.status })),
    error: row.error ? { code: row.error.code ?? "INTERNAL", message: row.error.message ?? "Job failed." } : null,
    estimated_cost_usd: row.estimated_cost == null ? null : Number(row.estimated_cost),
    actual_cost_usd: Number(row.actual_cost),
    result: steps.at(-1)?.output ?? null,
    created_at: row.created_at,
    completed_at: row.completed_at,
  };
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export interface UsageRow {
  id: string;
  task_type: string;
  model: string;
  status: string;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  error_code: string | null;
  project_id: string | null;
  job_id: string | null;
  created_at: string;
}

export interface UsageSummary {
  today_usd: number;
  month_usd: number;
  calls_this_month: number;
  by_task: Array<{ task_type: string; calls: number; cost_usd: number }>;
  recent: UsageRow[];
}

/** Spend aggregates for the Usage page. Windows are UTC, matching budget enforcement. */
export async function getUsageSummary(db: UserClient, now = new Date()): Promise<UsageSummary> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const { data, error } = await db
    .from("provider_usage")
    .select("id, task_type, model, status, input_tokens, output_tokens, estimated_cost, actual_cost, error_code, project_id, job_id, created_at")
    .gte("created_at", monthStart)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw fromDatabaseError(error);
  const rows = data as UsageRow[];
  const cost = (r: UsageRow) => (r.status === "blocked_budget" ? 0 : Number(r.actual_cost ?? r.estimated_cost ?? 0));
  const byTask = new Map<string, { calls: number; cost_usd: number }>();
  let today = 0;
  let month = 0;
  for (const r of rows) {
    const c = cost(r);
    month += c;
    if (r.created_at >= dayStart) today += c;
    const t = byTask.get(r.task_type) ?? { calls: 0, cost_usd: 0 };
    t.calls += 1;
    t.cost_usd += c;
    byTask.set(r.task_type, t);
  }
  const round = (n: number) => Math.round(n * 10_000) / 10_000;
  return {
    today_usd: round(today),
    month_usd: round(month),
    calls_this_month: rows.filter((r) => r.status !== "blocked_budget").length,
    by_task: [...byTask].map(([task_type, v]) => ({ task_type, calls: v.calls, cost_usd: round(v.cost_usd) })),
    recent: rows.slice(0, 25),
  };
}
