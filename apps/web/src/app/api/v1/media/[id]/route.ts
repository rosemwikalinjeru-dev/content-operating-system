import { getMedia } from "@contentos/database";
import { Uuid } from "@contentos/schemas";
import { AppError } from "@contentos/shared";
import type { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

type Params = { id: string };

/** Stream one of the owner's uploaded images (RLS: only her own files). Used by the video export. */
export async function GET(_req: NextRequest, context: { params: Promise<Params> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const { db } = await requireApiSession();
    const id = Uuid.safeParse((await context.params).id);
    if (!id.success) throw new AppError("VALIDATION_FAILED", "Invalid media id.");
    const [media] = await getMedia(db, [id.data]);
    if (!media || !media.mime_type.startsWith("image/")) throw new AppError("NOT_FOUND", "Image not found.");
    const { data, error } = await db.storage.from(media.storage_bucket).download(media.storage_path);
    if (error || !data) throw new AppError("NOT_FOUND", "Image not found.");
    return new Response(data, {
      headers: { "content-type": media.mime_type, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff", "x-request-id": requestId },
    });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
