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

export const maxDuration = 120;

/**
 * Render every slide and save PNGs, one PDF and a ZIP. Blocked while a readability check fails,
 * unless the owner gives a reason (recorded with the export).
 */
export const POST = api<Params>(async ({ req, params }) => {
  const { db, userId } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "design");
  const { override_reason, aspects } = await parseJson(req, ExportRequest);
  const design = await getDesign(db, id);
  const ctx = await designContext(db, design.asset_id);
  const sets = aspects.map((aspect) => ({ aspect, plans: planCarousel(design.slides, { template: design.template, brand: ctx.brand, aspect }) }));
  const issues = sets.flatMap((s) => s.plans.flatMap((p) => p.issues.map((i) => ({ ...i, aspect: s.aspect }))));
  if (issues.length && !override_reason) {
    throw new AppError(
      "CONFLICT",
      `Fix the readability checks first, or export with a reason: ${issues.map((i) => `${i.slide} (${i.aspect}): ${i.message}`).join(" ")}`,
      { issues },
    );
  }
  const mediaIds = sets.flatMap((s) => s.plans.flatMap((p) => p.elements.flatMap((e) => (e.kind === "image" ? [e.mediaId] : []))));
  const images = await mediaDataUrls(db, [...new Set(mediaIds)]);
  const slug = ctx.projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "carousel";
  const base = { userId, brandId: ctx.brandId, projectId: ctx.projectId, assetId: design.asset_id, designId: design.id, designVersion: design.version, overrideReason: issues.length ? override_reason : undefined, issues };
  const files = [];
  for (const set of sets) {
    const tag = set.aspect === "4:5" ? "4x5" : "1x1";
    const pngs: Uint8Array[] = [];
    for (const plan of set.plans) pngs.push(await renderSlidePng(plan, images));
    const size = { width: set.plans[0]!.width, height: set.plans[0]!.height };
    const pdf = await slidesToPdf(pngs, size, ctx.projectTitle);
    const zip = slidesToZip(
      pngs,
      pdf,
      `${ctx.projectTitle}\nDesign v${design.version} (${design.template}), ${pngs.length} slides, ${size.width}x${size.height} (${set.aspect}).\n${set.aspect === "4:5" ? "For Instagram, TikTok photo mode and LinkedIn (upload carousel.pdf as a document post)." : "For YouTube community posts."}\n`,
    );
    files.push(await saveRender({ ...base, file: `${slug}-v${design.version}-${tag}.pdf`, bytes: pdf, mime: "application/pdf" }));
    files.push(await saveRender({ ...base, file: `${slug}-v${design.version}-${tag}.zip`, bytes: zip, mime: "application/zip" }));
    for (const [i, png] of pngs.entries()) {
      files.push(await saveRender({ ...base, file: `${slug}-v${design.version}-${tag}-slide-${String(i + 1).padStart(2, "0")}.png`, bytes: png, mime: "image/png", width: size.width, height: size.height }));
    }
  }
  return json({ files, overridden: issues.length > 0 }, 201);
});
