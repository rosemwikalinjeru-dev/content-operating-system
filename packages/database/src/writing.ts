/** User-scoped access to written content (RLS applies). */
import { AppError, fromDatabaseError } from "@contentos/shared";
import {
  FORMAT_ASSET,
  formatFromAsset,
  type ContentAssetView,
  type ContentVersionView,
  type DraftBody,
} from "@contentos/schemas";
import type { UserClient } from "./client";

const VERSION_COLUMNS = "id, version, status, created_by, model, change_note, revised_section, parent_version, body, created_at";

export async function listProjectAssets(db: UserClient, projectId: string): Promise<ContentAssetView[]> {
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

/** The newest queued or running writing job for a project (to resume its progress view). */
export async function activeWritingJob(db: UserClient, projectId: string): Promise<{ id: string; job_type: string } | null> {
  const { data, error } = await db
    .from("production_jobs")
    .select("id, job_type")
    .eq("project_id", projectId)
    .in("job_type", ["write_content", "revise_section"])
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  return data as { id: string; job_type: string } | null;
}
