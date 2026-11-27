import { designContext, getDesign, mediaDataUrls } from "@contentos/database";
import { ExportRequest, Uuid } from "@contentos/schemas";
import { AppError } from "@contentos/shared";
import { planCarousel } from "@contentos/visual";
import { api, json, parseJson, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";
import { saveRender } from "@/lib/renders";
import { slidesToPdf, slidesToZip } from "@/render/export";
import { renderSlidePng } from "@/render/render";

type Params = { id: string };

export const maxDuration = 60;

/**
 * Render every slide and save PNGs, one PDF and a ZIP. Blocked while a readability check fails,
 * unless the owner gives a reason (recorded with the export).
 */
export const POST = api<Params>(async ({ req, params }) => {
  const { db, userId } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "design");
  const { override_reason } = await parseJson(req, ExportRequest);
  const design = await getDesign(db, id);
  const ctx = await designContext(db, design.asset_id);
  const plans = planCarousel(design.slides, { template: design.template, brand: ctx.brand });
  const issues = plans.flatMap((p) => p.issues);
  if (issues.length && !override_reason) {
    throw new AppError("CONFLICT", `Fix the readability checks first, or export with a reason: ${issues.map((i) => `${i.slide}: ${i.message}`).join(" ")}`, {
      issues,
    });
  }
  const mediaIds = plans.flatMap((p) => p.elements.flatMap((e) => (e.kind === "image" ? [e.mediaId] : [])));
  const images = await mediaDataUrls(db, mediaIds);
  const pngs: Uint8Array[] = [];
  for (const plan of plans) pngs.push(await renderSlidePng(plan, images));
  const slug = ctx.projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "carousel";
  const pdf = await slidesToPdf(pngs, undefined, ctx.projectTitle);
  const zip = slidesToZip(pngs, pdf, `${ctx.projectTitle}\nDesign v${design.version} (${design.template}), ${pngs.length} slides, 1080x1350.\nUpload carousel.pdf to LinkedIn as a document post.\n`);
  const base = { userId, brandId: ctx.brandId, projectId: ctx.projectId, assetId: design.asset_id, designId: design.id, designVersion: design.version, overrideReason: issues.length ? override_reason : undefined, issues };
  const files = [
    await saveRender({ ...base, file: `${slug}-v${design.version}.pdf`, bytes: pdf, mime: "application/pdf" }),
    await saveRender({ ...base, file: `${slug}-v${design.version}.zip`, bytes: zip, mime: "application/zip" }),
  ];
  for (const [i, png] of pngs.entries()) {
    files.push(await saveRender({ ...base, file: `${slug}-v${design.version}-slide-${String(i + 1).padStart(2, "0")}.png`, bytes: png, mime: "image/png" }));
  }
  return json({ files, overridden: issues.length > 0 }, 201);
});
