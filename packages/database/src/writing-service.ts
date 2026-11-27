/**
 * Worker-side data access for Phase 3 writing (service role). Every function filters by userId.
 * Re-exported from `@contentos/database/service`.
 */
import { AppError, fromDatabaseError } from "@contentos/shared";
import type { ServiceClient } from "./service";

export interface ApprovedBriefRecord {
  id: string;
  project_id: string;
  version: number;
  brief: unknown;
  approval_status: string;
}

export async function loadBrief(db: ServiceClient, userId: string, briefId: string): Promise<ApprovedBriefRecord> {
  const { data, error } = await db
    .from("content_briefs")
    .select("id, project_id, version, brief, approval_status")
    .eq("id", briefId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Brief not found.");
  return data as ApprovedBriefRecord;
}

/** The live asset for a project and format, created on first use. */
export async function ensureAsset(
  db: ServiceClient,
  userId: string,
  input: { projectId: string; briefId: string; platform: string; format: string; title: string },
): Promise<string> {
  const find = () =>
    db
      .from("content_assets")
      .select("id")
      .eq("user_id", userId)
      .eq("project_id", input.projectId)
      .eq("platform", input.platform)
      .eq("format", input.format)
      .is("deleted_at", null)
      .maybeSingle();
  const existing = await find();
  if (existing.error) throw fromDatabaseError(existing.error);
  if (existing.data) {
    const id = (existing.data as { id: string }).id;
    await db.from("content_assets").update({ brief_id: input.briefId }).eq("id", id).eq("user_id", userId);
    return id;
  }
  const { data, error } = await db
    .from("content_assets")
    .insert({ user_id: userId, project_id: input.projectId, brief_id: input.briefId, platform: input.platform, format: input.format, title: input.title })
    .select("id")
    .single();
  if (!error) return (data as { id: string }).id;
  if (error.code !== "23505") throw fromDatabaseError(error);
  const again = await find();
  if (again.error || !again.data) throw fromDatabaseError(again.error);
  return (again.data as { id: string }).id;
}

export interface VersionRecord {
  id: string;
  asset_id: string;
  version: number;
  body: unknown;
  input_hash: string | null;
  created_by: "ai" | "human";
}

/** The newest AI version written from exactly these inputs, if any. */
export async function versionByInputHash(db: ServiceClient, userId: string, assetId: string, inputHash: string): Promise<VersionRecord | null> {
  const { data, error } = await db
    .from("content_versions")
    .select("id, asset_id, version, body, input_hash, created_by")
    .eq("user_id", userId)
    .eq("asset_id", assetId)
    .eq("input_hash", inputHash)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  return data as VersionRecord | null;
}

export async function loadVersion(db: ServiceClient, userId: string, assetId: string, version: number): Promise<VersionRecord> {
  const { data, error } = await db
    .from("content_versions")
    .select("id, asset_id, version, body, input_hash, created_by")
    .eq("user_id", userId)
    .eq("asset_id", assetId)
    .eq("version", version)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Version not found.");
  return data as VersionRecord;
}

export interface AssetRecord {
  id: string;
  project_id: string;
  platform: string;
  format: string;
}

export async function loadAsset(db: ServiceClient, userId: string, assetId: string): Promise<AssetRecord> {
  const { data, error } = await db
    .from("content_assets")
    .select("id, project_id, platform, format")
    .eq("id", assetId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Content not found.");
  return data as AssetRecord;
}

/** Insert the next version atomically (database function locks the asset). */
export async function addVersion(
  db: ServiceClient,
  input: {
    assetId: string;
    body: unknown;
    createdBy: "ai" | "human";
    changeNote?: string | null;
    model?: string | null;
    provider?: string | null;
    promptTemplateId?: string | null;
    jobId?: string | null;
    inputHash?: string | null;
    parentVersion?: number | null;
    revisedSection?: string | null;
  },
): Promise<{ id: string; version: number }> {
  const { data, error } = await db
    .rpc("add_content_version", {
      p_asset_id: input.assetId,
      p_body: input.body,
      p_created_by: input.createdBy,
      p_change_note: input.changeNote ?? null,
      p_model: input.model ?? null,
      p_provider: input.provider ?? null,
      p_prompt_template_id: input.promptTemplateId ?? null,
      p_job_id: input.jobId ?? null,
      p_input_hash: input.inputHash ?? null,
      p_parent_version: input.parentVersion ?? null,
      p_revised_section: input.revisedSection ?? null,
    })
    .single();
  if (error) throw fromDatabaseError(error);
  const row = data as { id: string; version: number };
  return { id: row.id, version: row.version };
}

export async function markProjectInProduction(db: ServiceClient, userId: string, projectId: string): Promise<void> {
  const { error } = await db
    .from("content_projects")
    .update({ status: "in_production" })
    .eq("id", projectId)
    .eq("user_id", userId)
    .in("status", ["draft", "briefing"]);
  if (error) throw fromDatabaseError(error);
}
