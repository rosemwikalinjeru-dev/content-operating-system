import { addDesignAsOwner, designContext, getDesign, uploadScreenshot } from "@contentos/database";
import { Uuid, type DesignSlide } from "@contentos/schemas";
import { AppError } from "@contentos/shared";
import { createHash } from "node:crypto";
import { api, json, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";
import { sniffImage } from "@/lib/images";

type Params = { id: string };

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Upload the owner's screenshot for one slide (multipart: slide, file, rights=yes). Stored in
 * her private uploads folder; the design gets a new version with the image attached.
 */
export const POST = api<Params>(async ({ req, params }) => {
  const { db, userId } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "design");
  const form = await req.formData().catch(() => null);
  if (!form) throw new AppError("VALIDATION_FAILED", "Send the screenshot as a form upload.");
  const slideId = String(form.get("slide") ?? "");
  const file = form.get("file");
  if (form.get("rights") !== "yes") throw new AppError("VALIDATION_FAILED", "Confirm the screenshot is yours to publish.");
  if (!(file instanceof File)) throw new AppError("VALIDATION_FAILED", "Choose an image file.");
  if (file.size > MAX_BYTES) throw new AppError("PAYLOAD_TOO_LARGE", "Screenshots can be up to 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) throw new AppError("VALIDATION_FAILED", "Only PNG or JPEG images are supported.");

  const design = await getDesign(db, id);
  const index = design.slides.findIndex((s) => s.id === slideId);
  if (index < 0) throw new AppError("VALIDATION_FAILED", `Slide ${slideId} is not in this design.`);
  const ctx = await designContext(db, design.asset_id);
  const mediaId = await uploadScreenshot(db, userId, {
    brandId: ctx.brandId,
    projectId: ctx.projectId,
    bytes,
    mime: kind.mime,
    width: kind.width,
    height: kind.height,
    checksum: createHash("sha256").update(bytes).digest("hex"),
  });
  const slides = design.slides.map((s, i): DesignSlide =>
    i === index
      ? { ...s, layout: "screenshot", visual: { type: "screenshot", media_id: mediaId, caption: s.visual.type === "screenshot" ? s.visual.caption : null } }
      : s,
  );
  const saved = await addDesignAsOwner(db, {
    assetId: design.asset_id,
    sourceVersion: design.source_version,
    template: design.template,
    slides,
    parentVersion: design.version,
    note: `${slideId}: screenshot added`,
  });
  return json(saved, 201);
});
