/**
 * Worker-side data access for Phase 5 carousel designs (service role). Every function filters by
 * userId. Re-exported from `@contentos/database/service`.
 */
import { AppError, fromDatabaseError } from "@contentos/shared";
import type { ServiceClient } from "./service";

export interface DesignRecord {
  id: string;
  asset_id: string;
  version: number;
  source_version: number;
  template: string;
  slides: unknown;
}

export async function loadDesign(db: ServiceClient, userId: string, designId: string): Promise<DesignRecord> {
  const { data, error } = await db
    .from("carousel_designs")
    .select("id, asset_id, version, source_version, template, slides")
    .eq("id", designId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Design not found.");
  return data as DesignRecord;
}

/** The narrative version to design from: the one asked for, else the approved one, else the latest. */
export async function loadNarrativeVersion(
  db: ServiceClient,
  userId: string,
  assetId: string,
  version?: number,
): Promise<{ version: number; body: unknown }> {
  let q = db.from("content_versions").select("version, body, status").eq("user_id", userId).eq("asset_id", assetId);
  if (version) q = q.eq("version", version);
  const { data, error } = await q.order("version", { ascending: false }).limit(50);
  if (error) throw fromDatabaseError(error);
  const rows = data as Array<{ version: number; body: unknown; status: string }>;
  const pick = version ? rows[0] : (rows.find((r) => r.status === "approved") ?? rows[0]);
  if (!pick) throw new AppError("NOT_FOUND", "The carousel narrative has no versions yet. Write it first.");
  return { version: pick.version, body: pick.body };
}

export async function addDesign(
  db: ServiceClient,
  input: {
    assetId: string;
    sourceVersion: number;
    template: string;
    slides: unknown[];
    createdBy: "ai" | "human";
    changeNote?: string | null;
    model?: string | null;
    promptTemplateId?: string | null;
    jobId?: string | null;
    parentVersion?: number | null;
  },
): Promise<{ id: string; version: number }> {
  const { data, error } = await db
    .rpc("add_carousel_design", {
      p_asset_id: input.assetId,
      p_source_version: input.sourceVersion,
      p_template: input.template,
      p_slides: input.slides,
      p_created_by: input.createdBy,
      p_change_note: input.changeNote ?? null,
      p_model: input.model ?? null,
      p_prompt_template_id: input.promptTemplateId ?? null,
      p_job_id: input.jobId ?? null,
      p_parent_version: input.parentVersion ?? null,
    })
    .single();
  if (error) throw fromDatabaseError(error);
  const row = data as { id: string; version: number };
  return { id: row.id, version: row.version };
}
