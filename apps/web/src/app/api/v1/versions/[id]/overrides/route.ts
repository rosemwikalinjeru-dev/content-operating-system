import { addGateOverride, getVersionById } from "@contentos/database";
import { GateOverrideCreate, Uuid } from "@contentos/schemas";
import { api, json, parseJson, parseParam } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

type Params = { id: string };

/** Record the owner's reason for approving despite a failed gate. Overrides cannot be edited. */
export const POST = api<Params>(async ({ req, params }) => {
  const { db, userId } = await requireApiSession();
  const id = parseParam(params.id, Uuid, "version");
  const input = await parseJson(req, GateOverrideCreate);
  await getVersionById(db, id);
  await addGateOverride(db, userId, id, input.gate, input.reason);
  return json({ gate: input.gate, reason: input.reason }, 201);
});
