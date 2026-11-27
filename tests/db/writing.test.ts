import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, createUser, defaultBrandId, expectError, type Db } from "./helpers";

let db: Db;
let alice: string;
let bob: string;
let aliceBrand: string;

beforeAll(async () => {
  db = await connect();
  alice = await createUser(db, `p3-alice-${Date.now()}@example.test`);
  bob = await createUser(db, `p3-bob-${Date.now()}@example.test`);
  aliceBrand = await defaultBrandId(db, alice);
});

afterAll(async () => {
  await db.end();
});

async function asset(): Promise<string> {
  const { rows: p } = await db.query<{ id: string }>(
    `insert into public.content_projects (user_id, brand_id, title, production_mode) values ($1, $2, 'P', 'idea_to_content') returning id`,
    [alice, aliceBrand],
  );
  const { rows } = await db.query<{ id: string }>(
    `insert into public.content_assets (user_id, project_id, platform, format) values ($1, $2, 'linkedin', 'post') returning id`,
    [alice, p[0]!.id],
  );
  return rows[0]!.id;
}

const add = `select version, status from public.add_content_version($1, $2::jsonb, $3, null, $4)`;

describe("content versions", () => {
  it("numbers versions atomically, approves one at a time and keeps bodies immutable", async () => {
    await asUser(db, alice, async () => {
      const id = await asset();
      expect((await db.query(add, [id, '{"sections":[]}', "ai", "claude-sonnet-5-5"])).rows[0]).toEqual({ version: 1, status: "draft" });
      expect((await db.query(add, [id, '{"sections":[1]}', "human", null])).rows[0]).toEqual({ version: 2, status: "draft" });
      // AI versions must name their model.
      expect(await expectError(db, add, [id, "{}", "ai", null])).toBe("23514");

      const { rows: vs } = await db.query<{ id: string; version: number }>("select id, version from public.content_versions where asset_id = $1 order by version", [id]);
      await db.query("select public.approve_content_version($1)", [vs[0]!.id]);
      await db.query("select public.approve_content_version($1)", [vs[1]!.id]);
      const { rows: st } = await db.query("select version, status from public.content_versions where asset_id = $1 order by version", [id]);
      expect(st).toEqual([
        { version: 1, status: "superseded" },
        { version: 2, status: "approved" },
      ]);
      const { rows: a } = await db.query("select status, approved_version, current_version from public.content_assets where id = $1", [id]);
      expect(a[0]).toEqual({ status: "approved", approved_version: 2, current_version: 2 });

      expect(await expectError(db, "update public.content_versions set body = '{}' where id = $1", [vs[0]!.id])).toBe("P0001");

      // A new version after approval moves the asset back to review.
      await db.query(add, [id, "{}", "human", null]);
      const { rows: a2 } = await db.query("select status from public.content_assets where id = $1", [id]);
      expect(a2[0]!.status).toBe("in_review");
    });
  });

  it("allows one live asset per project and format", async () => {
    await asUser(db, alice, async () => {
      const id = await asset();
      const { rows } = await db.query<{ project_id: string }>("select project_id from public.content_assets where id = $1", [id]);
      expect(
        await expectError(db, `insert into public.content_assets (user_id, project_id, platform, format) values ($1, $2, 'linkedin', 'post')`, [alice, rows[0]!.project_id]),
      ).toBe("23505");
    });
  });

  it("other users cannot add versions to or approve someone else's asset", async () => {
    let id = "";
    let versionId = "";
    await db.query("begin");
    try {
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: alice, role: "authenticated" })]);
      await db.query("set local role authenticated");
      id = await asset();
      versionId = (await db.query<{ id: string }>("select id from public.add_content_version($1, '{}'::jsonb, 'human')", [id])).rows[0]!.id;
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bob, role: "authenticated" })]);
      expect(await expectError(db, "select public.add_content_version($1, '{}'::jsonb, 'human')", [id])).toBe("P0002");
      expect(await expectError(db, "select public.approve_content_version($1)", [versionId])).toBe("P0002");
    } finally {
      await db.query("rollback");
    }
  });
});
