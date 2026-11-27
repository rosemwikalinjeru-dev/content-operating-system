import { addDesignAsOwner, designContext, getDesignVersion, listDesigns, listExports } from "@contentos/database";
import { CarouselSlides, DesignEdit, renumber, Uuid } from "@contentos/schemas";
import { AppError } from "@contentos/shared";
import { planCarousel } from "@contentos/visual";
import { api, json, parseJson, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

type Params = { id: string };

/** Design versions (newest first) with each slide's readability result, plus past exports. */
export const GET = api<Params>(async ({ params }) => {
  const { db } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "content");
  const ctx = await designContext(db, id);
  const [designs, exports] = await Promise.all([listDesigns(db, id), listExports(db, id)]);
  return json({
    data: designs.map((d) => ({ ...d, issues: planCarousel(d.slides, { template: d.template, brand: ctx.brand }).flatMap((p) => p.issues) })),
    exports,
  });
});

/** Save the owner's edits (text, layout, order, add/remove) as a new design version. */
export const POST = api<Params>(async ({ req, params }) => {
  const { db } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "content");
  const input = await parseJson(req, DesignEdit);
  await designContext(db, id);
  const base = await getDesignVersion(db, id, input.base_version);
  const slides = CarouselSlides.safeParse(renumber(input.slides.map((s) => ({ ...s, id: "d1" }))));
  if (!slides.success) throw new AppError("VALIDATION_FAILED", "A carousel needs 3 to 12 valid slides.");
  const saved = await addDesignAsOwner(db, {
    assetId: id,
    sourceVersion: base.source_version,
    template: input.template,
    slides: slides.data,
    parentVersion: base.version,
    note: input.note ?? "Edited by hand",
  });
  return json(saved, 201);
});
