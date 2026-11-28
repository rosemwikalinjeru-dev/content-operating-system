import "server-only";
import { createServiceClient } from "@contentos/database/service";
import { AppError } from "@contentos/shared";
import { createHash } from "node:crypto";

/**
 * Rendered files go to the private "renders" bucket, which only the server can write (storage
 * policies). The service-role key is server-side only; every path is under the owner's folder.
 */
function serviceDb() {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) throw new AppError("SERVICE_UNAVAILABLE", "Exports need SUPABASE_SERVICE_ROLE_KEY in Vercel.");
  return createServiceClient(url, key);
}

export interface SavedRender {
  id: string;
  file: string;
  url: string;
}

export async function saveRender(input: {
  userId: string;
  brandId: string;
  projectId: string;
  assetId: string;
  designId: string;
  designVersion: number;
  file: string;
  bytes: Uint8Array;
  mime: "image/png" | "application/pdf" | "application/zip";
  overrideReason?: string;
  issues?: unknown[];
  width?: number;
  height?: number;
}): Promise<SavedRender> {
  const db = serviceDb();
  const ext = input.mime === "image/png" ? "png" : input.mime === "application/pdf" ? "pdf" : "zip";
  const path = `${input.userId}/${crypto.randomUUID()}.${ext}`;
  const up = await db.storage.from("renders").upload(path, input.bytes, { contentType: input.mime, upsert: false });
  if (up.error) throw new AppError("SERVICE_UNAVAILABLE", "The export could not be stored. Try again.");
  const { data, error } = await db
    .from("media_assets")
    .insert({
      user_id: input.userId,
      brand_id: input.brandId,
      project_id: input.projectId,
      kind: input.mime === "image/png" ? "image" : input.mime === "application/pdf" ? "document" : "archive",
      role: "rendered",
      storage_bucket: "renders",
      storage_path: path,
      mime_type: input.mime,
      size_bytes: input.bytes.byteLength,
      width: input.width ?? null,
      height: input.height ?? null,
      checksum: createHash("sha256").update(input.bytes).digest("hex"),
      metadata: {
        asset_id: input.assetId,
        design_id: input.designId,
        design_version: input.designVersion,
        file: input.file,
        ...(input.overrideReason ? { override_reason: input.overrideReason, overridden_issues: input.issues ?? [] } : {}),
      },
    })
    .select("id")
    .single();
  if (error) throw new AppError("SERVICE_UNAVAILABLE", "The export could not be recorded. Try again.");
  const signed = await db.storage.from("renders").createSignedUrl(path, 600, { download: input.file });
  if (signed.error || !signed.data) throw new AppError("SERVICE_UNAVAILABLE", "The download link could not be created.");
  return { id: (data as { id: string }).id, file: input.file, url: signed.data.signedUrl };
}
