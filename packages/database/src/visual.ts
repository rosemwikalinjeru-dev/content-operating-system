/** User-scoped access to carousel designs, uploads and exports (RLS applies). */
import { AppError, fromDatabaseError } from "@contentos/shared";
import type { BrandProfile, CarouselDesignView, DesignSlide } from "@contentos/schemas";
import type { UserClient } from "./client";

const DESIGN_COLUMNS = "id, asset_id, version, source_version, template, slides, change_note, created_by, model, created_at";

export async function listDesigns(db: UserClient, assetId: string, limit = 20): Promise<CarouselDesignView[]> {
  const { data, error } = await db.from("carousel_designs").select(DESIGN_COLUMNS).eq("asset_id", assetId).order("version", { ascending: false }).limit(limit);
  if (error) throw fromDatabaseError(error);
  return data as CarouselDesignView[];
}

export async function getDesign(db: UserClient, id: string): Promise<CarouselDesignView & { asset_id: string }> {
  const { data, error } = await db.from("carousel_designs").select(DESIGN_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Design not found.");
  return data as CarouselDesignView & { asset_id: string };
}

export async function getDesignVersion(db: UserClient, assetId: string, version: number): Promise<CarouselDesignView & { asset_id: string }> {
  const { data, error } = await db.from("carousel_designs").select(DESIGN_COLUMNS).eq("asset_id", assetId).eq("version", version).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Design version not found.");
  return data as CarouselDesignView & { asset_id: string };
}

export async function addDesignAsOwner(
  db: UserClient,
  input: { assetId: string; sourceVersion: number; template: string; slides: DesignSlide[]; parentVersion: number; note: string | null },
): Promise<CarouselDesignView> {
  const { data, error } = await db
    .rpc("add_carousel_design", {
      p_asset_id: input.assetId,
      p_source_version: input.sourceVersion,
      p_template: input.template,
      p_slides: input.slides,
      p_created_by: "human",
      p_change_note: input.note,
      p_parent_version: input.parentVersion,
    })
    .single();
  if (error) {
    if (error.code === "P0002") throw new AppError("NOT_FOUND", "Content not found.");
    throw fromDatabaseError(error);
  }
  return data as CarouselDesignView;
}

/** Asset, project and brand for a carousel asset (render context). */
export async function designContext(db: UserClient, assetId: string): Promise<{ projectId: string; brandId: string; projectTitle: string; brand: BrandProfile }> {
  const { data, error } = await db
    .from("content_assets")
    .select("id, format, project_id, content_projects(id, title, brand_id, brand_profiles(*))")
    .eq("id", assetId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Content not found.");
  const row = data as unknown as { format: string; content_projects: { id: string; title: string; brand_id: string; brand_profiles: BrandProfile } | null };
  if (row.format !== "carousel") throw new AppError("VALIDATION_FAILED", "Only carousels can be designed.");
  if (!row.content_projects) throw new AppError("NOT_FOUND", "Project not found.");
  return {
    projectId: row.content_projects.id,
    brandId: row.content_projects.brand_id,
    projectTitle: row.content_projects.title,
    brand: row.content_projects.brand_profiles,
  };
}

export interface MediaRow {
  id: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
}

export async function getMedia(db: UserClient, ids: string[]): Promise<MediaRow[]> {
  if (!ids.length) return [];
  const { data, error } = await db.from("media_assets").select("id, storage_bucket, storage_path, mime_type").in("id", ids).is("deleted_at", null);
  if (error) throw fromDatabaseError(error);
  return data as MediaRow[];
}

/** Download owned media as data URLs (RLS: the owner can read only her own folder). */
export async function mediaDataUrls(db: UserClient, ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const m of await getMedia(db, ids)) {
    const { data, error } = await db.storage.from(m.storage_bucket).download(m.storage_path);
    if (error || !data) continue;
    out[m.id] = `data:${m.mime_type};base64,${Buffer.from(await data.arrayBuffer()).toString("base64")}`;
  }
  return out;
}

export async function uploadScreenshot(
  db: UserClient,
  userId: string,
  input: { brandId: string; projectId: string; bytes: Uint8Array; mime: "image/png" | "image/jpeg"; width: number | null; height: number | null; checksum: string },
): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.${input.mime === "image/png" ? "png" : "jpg"}`;
  const up = await db.storage.from("uploads").upload(path, input.bytes, { contentType: input.mime, upsert: false });
  if (up.error) throw new AppError("SERVICE_UNAVAILABLE", "The upload could not be stored. Try again.");
  const { data, error } = await db
    .from("media_assets")
    .insert({
      user_id: userId,
      brand_id: input.brandId,
      project_id: input.projectId,
      kind: "image",
      role: "original_upload",
      storage_bucket: "uploads",
      storage_path: path,
      mime_type: input.mime,
      size_bytes: input.bytes.byteLength,
      width: input.width,
      height: input.height,
      checksum: input.checksum,
      rights_confirmed: true,
      metadata: { purpose: "carousel_screenshot" },
    })
    .select("id")
    .single();
  if (error) throw fromDatabaseError(error);
  return (data as { id: string }).id;
}

export interface ExportRow {
  id: string;
  kind: string;
  mime_type: string;
  size_bytes: number | null;
  metadata: { design_version?: number; file?: string; override_reason?: string };
  created_at: string;
}

export async function listExports(db: UserClient, assetId: string): Promise<ExportRow[]> {
  const { data, error } = await db
    .from("media_assets")
    .select("id, kind, mime_type, size_bytes, metadata, created_at")
    .eq("role", "rendered")
    .eq("metadata->>asset_id", assetId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw fromDatabaseError(error);
  return data as ExportRow[];
}
