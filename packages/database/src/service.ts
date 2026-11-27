/**
 * Worker-side data access with the SERVICE ROLE client (bypasses RLS).
 *
 * Only background workers import this module (`@contentos/database/service`); the web app never
 * does. Because RLS does not apply, every function takes the job owner's userId and filters by
 * it explicitly. Never pass a userId that did not come from a job row loaded by id.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError, fromDatabaseError } from "@contentos/shared";
import { normaliseBrand, type BrandProfile, type KnowledgeEntry, type UserSettings } from "@contentos/schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServiceClient = SupabaseClient<any, "public", "public", any, any>;

/** Service-role client for workers. Never construct this in the web app. */
export function createServiceClient(url: string, serviceRoleKey: string): ServiceClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) as ServiceClient;
}

// ---------------------------------------------------------------------------
// Jobs and steps
// ---------------------------------------------------------------------------

export interface JobRecord {
  id: string;
  user_id: string;
  job_type: string;
  status: string;
  project_id: string | null;
  input: Record<string, unknown>;
  budget_limit_usd: number | null;
}

export async function loadJob(db: ServiceClient, jobId: string): Promise<JobRecord> {
  const { data, error } = await db
    .from("production_jobs")
    .select("id, user_id, job_type, status, project_id, input, budget_limit_usd")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", `Job ${jobId} not found.`);
  return data as JobRecord;
}

export async function updateJob(
  db: ServiceClient,
  job: Pick<JobRecord, "id" | "user_id">,
  patch: Partial<{
    status: string;
    progress: number;
    current_step: string;
    error: { code: string; message: string } | null;
    estimated_cost: number;
    actual_cost: number;
    started_at: string;
    completed_at: string;
  }>,
): Promise<void> {
  const { error } = await db.from("production_jobs").update(patch).eq("id", job.id).eq("user_id", job.user_id);
  if (error) throw fromDatabaseError(error);
}

export interface StepRecord {
  id: string;
  status: string;
  input_hash: string | null;
  output: Record<string, unknown> | null;
  attempt: number;
}

/** Upsert the step row and report whether a completed run with the same inputs exists. */
export async function beginStep(
  db: ServiceClient,
  job: Pick<JobRecord, "id" | "user_id">,
  step: { name: string; position: number; inputHash: string },
): Promise<{ step: StepRecord; reusable: boolean }> {
  const existing = await db
    .from("job_steps")
    .select("id, status, input_hash, output, attempt")
    .eq("job_id", job.id)
    .eq("user_id", job.user_id)
    .eq("name", step.name)
    .maybeSingle();
  if (existing.error) throw fromDatabaseError(existing.error);

  const prev = existing.data as StepRecord | null;
  if (prev && prev.status === "completed" && prev.input_hash === step.inputHash) {
    return { step: prev, reusable: true };
  }

  const row = {
    user_id: job.user_id,
    job_id: job.id,
    name: step.name,
    position: step.position,
    status: "running",
    input_hash: step.inputHash,
    attempt: (prev?.attempt ?? 0) + 1,
    error: null,
    started_at: new Date().toISOString(),
  };
  const { data, error } = await db
    .from("job_steps")
    .upsert(row, { onConflict: "job_id,name" })
    .select("id, status, input_hash, output, attempt")
    .single();
  if (error) throw fromDatabaseError(error);
  return { step: data as StepRecord, reusable: false };
}

export async function finishStep(
  db: ServiceClient,
  job: Pick<JobRecord, "user_id">,
  stepId: string,
  result: { status: "completed" | "failed"; output?: Record<string, unknown>; error?: { code: string; message: string }; cost?: number },
): Promise<void> {
  const { error } = await db
    .from("job_steps")
    .update({
      status: result.status,
      output: result.output ?? null,
      error: result.error ?? null,
      cost: result.cost ?? 0,
      completed_at: new Date().toISOString(),
    })
    .eq("id", stepId)
    .eq("user_id", job.user_id);
  if (error) throw fromDatabaseError(error);
}

// ---------------------------------------------------------------------------
// Brand, settings, knowledge
// ---------------------------------------------------------------------------

export async function loadBrand(db: ServiceClient, userId: string, brandId: string): Promise<BrandProfile> {
  const { data, error } = await db
    .from("brand_profiles")
    .select("id, name, positioning, audience, voice_profile, brand_guidelines, is_default, status, created_at, updated_at")
    .eq("id", brandId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Brand not found.");
  return { ...(data as BrandProfile), ...normaliseBrand(data) };
}

export async function loadSettings(db: ServiceClient, userId: string): Promise<UserSettings> {
  const { data, error } = await db
    .from("user_settings")
    .select("budget_text_project_usd, budget_media_project_usd, budget_daily_usd, budget_monthly_usd")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Settings not found.");
  return {
    budget_text_project_usd: Number(data.budget_text_project_usd),
    budget_media_project_usd: Number(data.budget_media_project_usd),
    budget_daily_usd: Number(data.budget_daily_usd),
    budget_monthly_usd: Number(data.budget_monthly_usd),
  };
}

type KnowledgeLite = Pick<KnowledgeEntry, "id" | "kind" | "title" | "body">;

/** The owner's example posts, newest first (voice reference). */
export async function loadVoiceExamples(db: ServiceClient, userId: string, brandId: string, limit = 6): Promise<KnowledgeLite[]> {
  const { data, error } = await db
    .from("brand_knowledge")
    .select("id, kind, title, body")
    .eq("user_id", userId)
    .eq("brand_id", brandId)
    .eq("kind", "example_post")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw fromDatabaseError(error);
  return data as KnowledgeLite[];
}

const STOPWORDS = new Set(
  "about after again also because been before being both could does doing down each from further have having here into itself just more most other over same should some such than that their them then there these they this those through under until very what when where which while will with would your yours".split(
    " ",
  ),
);

/** Turn free text into an OR query of its distinctive words for websearch_to_tsquery. */
export function keywordQuery(text: string, max = 12): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, max).join(" or ");
}

/**
 * Usable knowledge related to the text (unverified facts, stories and experiences are excluded
 * by the database function). The brand must already be confirmed as the user's.
 */
export async function searchKnowledge(
  db: ServiceClient,
  userId: string,
  brandId: string,
  text: string,
  limit = 8,
): Promise<KnowledgeLite[]> {
  const query = keywordQuery(text);
  if (!query) return [];
  const { data, error } = await db.rpc("search_brand_knowledge", { p_brand_id: brandId, p_query: query, p_limit: limit });
  if (error) throw fromDatabaseError(error);
  // Defence in depth: the service role bypasses RLS, so confirm ownership of every row.
  const ids = (data as KnowledgeLite[]).map((k) => k.id);
  if (ids.length === 0) return [];
  const owned = await db.from("brand_knowledge").select("id").eq("user_id", userId).in("id", ids);
  if (owned.error) throw fromDatabaseError(owned.error);
  const ownedIds = new Set((owned.data as { id: string }[]).map((r) => r.id));
  return (data as KnowledgeLite[]).filter((k) => ownedIds.has(k.id));
}

// ---------------------------------------------------------------------------
// Ideas, projects, briefs
// ---------------------------------------------------------------------------

export interface IdeaRecord {
  id: string;
  brand_id: string;
  title: string;
  raw_input: string;
  status: string;
  analysis: unknown;
  analysis_input_hash: string | null;
}

export async function loadIdea(db: ServiceClient, userId: string, ideaId: string): Promise<IdeaRecord> {
  const { data, error } = await db
    .from("content_ideas")
    .select("id, brand_id, title, raw_input, status, analysis, analysis_input_hash")
    .eq("id", ideaId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Idea not found.");
  return data as IdeaRecord;
}

export async function saveIdeaAnalysis(
  db: ServiceClient,
  userId: string,
  ideaId: string,
  analysis: unknown,
  inputHash: string,
): Promise<void> {
  const { error } = await db
    .from("content_ideas")
    .update({ analysis, analysis_input_hash: inputHash, analyzed_at: new Date().toISOString() })
    .eq("id", ideaId)
    .eq("user_id", userId);
  if (error) throw fromDatabaseError(error);
}

export interface ProjectRecord {
  id: string;
  brand_id: string;
  idea_id: string | null;
  title: string;
  settings: { formats?: string[] };
}

export async function loadProject(db: ServiceClient, userId: string, projectId: string): Promise<ProjectRecord> {
  const { data, error } = await db
    .from("content_projects")
    .select("id, brand_id, idea_id, title, settings")
    .eq("id", projectId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Project not found.");
  return data as ProjectRecord;
}

/** Insert the next brief version (pending approval). Returns the new brief id and version. */
export async function insertBrief(
  db: ServiceClient,
  userId: string,
  input: { projectId: string; brief: unknown; model: string; promptTemplateId: string | null; inputHash: string; jobId: string },
): Promise<{ id: string; version: number }> {
  const latest = await db
    .from("content_briefs")
    .select("version")
    .eq("project_id", input.projectId)
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw fromDatabaseError(latest.error);
  const version = ((latest.data as { version: number } | null)?.version ?? 0) + 1;
  const { data, error } = await db
    .from("content_briefs")
    .insert({
      user_id: userId,
      project_id: input.projectId,
      version,
      brief: input.brief,
      model: input.model,
      prompt_template_id: input.promptTemplateId,
      input_hash: input.inputHash,
      job_id: input.jobId,
    })
    .select("id, version")
    .single();
  if (error) throw fromDatabaseError(error);
  await db.from("content_projects").update({ status: "briefing" }).eq("id", input.projectId).eq("user_id", userId).eq("status", "draft");
  return data as { id: string; version: number };
}

// ---------------------------------------------------------------------------
// Prompt templates and usage ledger
// ---------------------------------------------------------------------------

/** Ensure a row exists for this template version; returns its id. */
export async function ensurePromptTemplate(
  db: ServiceClient,
  userId: string,
  t: { name: string; version: number; purpose: string; body: string; hash: string },
): Promise<string> {
  const existing = await db
    .from("prompt_templates")
    .select("id, content_hash")
    .eq("user_id", userId)
    .eq("name", t.name)
    .eq("version", t.version)
    .maybeSingle();
  if (existing.error) throw fromDatabaseError(existing.error);
  if (existing.data) {
    if (existing.data.content_hash !== t.hash) {
      throw new AppError("INTERNAL", `Prompt ${t.name} v${t.version} changed without a version bump.`);
    }
    return existing.data.id as string;
  }
  const { data, error } = await db
    .from("prompt_templates")
    .insert({ user_id: userId, name: t.name, version: t.version, purpose: t.purpose, body: t.body, content_hash: t.hash })
    .select("id")
    .single();
  if (error && error.code === "23505") return ensurePromptTemplate(db, userId, t);
  if (error) throw fromDatabaseError(error);
  return data.id as string;
}

export async function sumSpend(
  db: ServiceClient,
  filter: { userId: string; since?: Date; projectId?: string; jobId?: string },
): Promise<number> {
  let q = db
    .from("provider_usage")
    .select("actual_cost, estimated_cost")
    .eq("user_id", filter.userId)
    .in("status", ["success", "error"]);
  if (filter.since) q = q.gte("created_at", filter.since.toISOString());
  if (filter.projectId) q = q.eq("project_id", filter.projectId);
  if (filter.jobId) q = q.eq("job_id", filter.jobId);
  const { data, error } = await q;
  if (error) throw fromDatabaseError(error);
  return (data as { actual_cost: number | null; estimated_cost: number | null }[]).reduce(
    (sum, r) => sum + Number(r.actual_cost ?? r.estimated_cost ?? 0),
    0,
  );
}

export async function insertUsage(db: ServiceClient, row: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("provider_usage").insert(row);
  if (error) throw fromDatabaseError(error);
}
