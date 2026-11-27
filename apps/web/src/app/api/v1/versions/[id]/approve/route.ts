import { approveContentVersion, gateSources, getVersionById, listGateOverrides } from "@contentos/database";
import { deterministicGates } from "@contentos/intelligence";
import { Uuid } from "@contentos/schemas";
import { AppError } from "@contentos/shared";
import { api, json, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

type Params = { id: string };

/**
 * Approve a version. Blocked while [placeholders] remain, and while a free check (banned
 * phrase, number with no source) or the latest review's gates fail without a recorded override.
 * The database function enforces the review gates too.
 */
export const PATCH = api<Params>(async ({ params }) => {
  const { db } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "version");
  const v = await getVersionById(db, id);
  if (v.body.placeholders?.length) {
    throw new AppError("CONFLICT", `Fill these before approving: ${v.body.placeholders.join(", ")}`, { placeholders: v.body.placeholders });
  }
  const [sources, overridden] = await Promise.all([gateSources(db, v.asset_id), listGateOverrides(db, id)]);
  const open = deterministicGates({ body: v.body, bannedPhrases: sources.banned, sourceText: `${sources.briefText}\n${sources.knowledgeText}` }).filter(
    (g) => !overridden.includes(g.code),
  );
  if (open.length) {
    throw new AppError("CONFLICT", `Fix or override first: ${open.map((g) => g.message).join(" ")}`, { gates: open.map((g) => g.code) });
  }
  try {
    return json(await approveContentVersion(db, id));
  } catch (err) {
    if (err instanceof AppError && err.code === "CONFLICT") {
      throw new AppError("CONFLICT", "The latest review has failed gates. Fix them or record an override reason first.");
    }
    throw err;
  }
});
