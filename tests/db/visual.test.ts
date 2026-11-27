import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, createUser, defaultBrandId, expectError, type Db } from "./helpers";

let db: Db;
let alice: string;
let bob: string;
let aliceBrand: string;

beforeAll(async () => {
  db = await connect();
  alice = await createUser(db, `p5-alice-${Date.now()}@example.test`);
  bob = await createUser(db, `p5-bob-${Date.now()}@example.test`);
  aliceBrand = await defaultBrandId(db, alice);
});

afterAll(async () => {
  await db.end();
});

async function asset(format = "carousel"): Promise<string> {
  const { rows: p } = await db.query<{ id: string }>(
    `insert into public.content_projects (user_id, brand_id, title, production_mode) values ($1, $2, 'P', 'idea_to_content') returning id`,
    [alice, aliceBrand],
  );
  const { rows } = await db.query<{ id: string }>(
    `insert into public.content_assets (user_id, project_id, platform, format) values ($1, $2, 'linkedin', $3) returning id`,
    [alice, p[0]!.id, format],
  );
  return rows[0]!.id;
}

const add = "select version from public.add_carousel_design($1, 1, 'statement', $2::jsonb, $3, null, $4)";

describe("carousel designs", () => {
  it("numbers versions, requires a model for AI designs and never changes a saved design", async () => {
    await asUser(db, alice, async () => {
      const id = await asset();
      expect((await db.query(add, [id, "[]", "ai", "claude-sonnet-5-5"])).rows[0].version).toBe(1);
      expect((await db.query(add, [id, '[{"id":"s1"}]', "human", null])).rows[0].version).toBe(2);
      expect(await expectError(db, add, [id, "[]", "ai", null])).toBe("23514");
      expect(await expectError(db, add, [id, '{"not":"array"}', "human", null])).toBe("23514");
      expect(await expectError(db, "update public.carousel_designs set template = 'notebook' where asset_id = $1", [id])).toBe("42501");
    });
  });

  it("only carousel assets get designs, and other users cannot add one", async () => {
    await asUser(db, alice, async () => {
      const post = await asset("post");
      expect(await expectError(db, add, [post, "[]", "human", null])).toBe("P0001");
    });
    await db.query("begin");
    try {
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: alice, role: "authenticated" })]);
      await db.query("set local role authenticated");
      const id = await asset();
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bob, role: "authenticated" })]);
      expect(await expectError(db, add, [id, "[]", "human", null])).toBe("P0002");
    } finally {
      await db.query("rollback");
    }
  });
});
