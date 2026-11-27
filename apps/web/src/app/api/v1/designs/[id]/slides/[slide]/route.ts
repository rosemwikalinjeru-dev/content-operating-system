import { designContext, getDesign, mediaDataUrls } from "@contentos/database";
import { Uuid } from "@contentos/schemas";
import { AppError } from "@contentos/shared";
import { planCarousel } from "@contentos/visual";
import type { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";
import { renderSlidePng } from "@/render/render";

type Params = { id: string; slide: string };

/** Preview one slide as PNG. Designs are immutable, so the browser may cache it privately. */
export async function GET(_req: NextRequest, context: { params: Promise<Params> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const { db } = await requireApiSession();
    const params = await context.params;
    const id = Uuid.safeParse(params.id);
    if (!id.success || !/^d\d{1,2}$/.test(params.slide)) throw new AppError("VALIDATION_FAILED", "Invalid slide.");
    const design = await getDesign(db, id.data);
    const ctx = await designContext(db, design.asset_id);
    const plans = planCarousel(design.slides, { template: design.template, brand: ctx.brand });
    const plan = plans.find((p) => p.slideId === params.slide);
    if (!plan) throw new AppError("NOT_FOUND", "Slide not found.");
    const mediaIds = plan.elements.flatMap((e) => (e.kind === "image" ? [e.mediaId] : []));
    const png = await renderSlidePng(plan, await mediaDataUrls(db, mediaIds));
    return new Response(new Blob([png as Uint8Array<ArrayBuffer>]), {
      headers: { "content-type": "image/png", "cache-control": "private, max-age=31536000, immutable", "x-request-id": requestId },
    });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
