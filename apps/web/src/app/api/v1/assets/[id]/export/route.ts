import { getAssetVersion } from "@contentos/database";
import { toMarkdown, Uuid } from "@contentos/schemas";
import { AppError } from "@contentos/shared";
import { api, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

type Params = { id: string };

/** Download a version as Markdown: GET /api/v1/assets/:id/export?version=n */
export const GET = api<Params>(async ({ req, params }) => {
  const { db } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "content");
  const version = Number(req.nextUrl.searchParams.get("version"));
  if (!Number.isInteger(version) || version < 1) throw new AppError("VALIDATION_FAILED", "version must be a positive integer.");
  const v = await getAssetVersion(db, id, version);
  return new Response(toMarkdown(v.body), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${v.body.format}-v${version}.md"`,
    },
  });
});
