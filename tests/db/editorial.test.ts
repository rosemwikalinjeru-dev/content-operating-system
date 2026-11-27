import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, createUser, defaultBrandId, expectError, type Db } from "./helpers";

let db: Db;
let alice: string;
let bob: string;
let aliceBrand: string;

beforeAll(async () => {
  db = await connect();
  alice = await createUser(db, `p4-alice-${Date.now()}@example.test`);
  bob = await createUser(db, `p4-bob-${Date.now()}@example.test`);
  aliceBrand = await defaultBrandId(db, alice);
});

afterAll(async () => {
  await db.end();
});

async function version(): Promise<{ assetId: string; versionId: string }> {
  const { rows: p } = await db.query<{ id: string }>(
    `insert into public.content_projects (user_id, brand_id, title, production_mode) values ($1, $2, 'P', 'idea_to_content') returning id`,
    [alice, aliceBrand],
  );
  const { rows: a } = await db.query<{ id: string }>(
    `insert into public.content_assets (user_id, project_id, platform, format) values ($1, $2, 'linkedin', 'post') returning id`,
    [alice, p[0]!.id],
  );
  const { rows: v } = await db.query<{ id: string }>("select id from public.add_content_version($1, '{}'::jsonb, 'human')", [a[0]!.id]);
  return { assetId: a[0]!.id, versionId: v[0]!.id };
}

async function review(assetId: string, versionId: string, gates: string): Promise<string> {
  // Reviews are written by the worker (service role); seeded here as the owner for the test.
  const { rows } = await db.query<{ id: string }>(
    `insert into public.quality_reviews (user_id, asset_id, version, version_id, total_score, gate_failures)
     values ($1, $2, 1, $3, 80, $4::jsonb) returning id`,
    [alice, assetId, versionId, gates],
  );
  return rows[0]!.id;
}

describe("editorial gates", () => {
  it("blocks approval on a failed gate until the owner records a reason", async () => {
    await asUser(db, alice, async () => {
      const { assetId, versionId } = await version();
      await review(assetId, versionId, '[{"code":"invented_number","message":"40% is not in the brief"}]');
      expect(await expectError(db, "select public.approve_content_version($1)", [versionId])).toBe("P0001");
      expect(await expectError(db, "insert into public.gate_overrides (user_id, version_id, gate, reason) values ($1, $2, 'invented_number', 'no')", [alice, versionId])).toBe("23514");
      await db.query("insert into public.gate_overrides (user_id, version_id, gate, reason) values ($1, $2, 'invented_number', 'The 40% is from my own client report')", [alice, versionId]);
      await db.query("select public.approve_content_version($1)", [versionId]);
      const { rows } = await db.query("select status from public.content_versions where id = $1", [versionId]);
      expect(rows[0]!.status).toBe("approved");
      // Overrides are an audit trail.
      expect(await expectError(db, "update public.gate_overrides set reason = 'changed reason' where version_id = $1", [versionId])).toBe("42501");
    });
  });

  it("approves a version whose latest review passed", async () => {
    await asUser(db, alice, async () => {
      const { assetId, versionId } = await version();
      await review(assetId, versionId, "[]");
      await db.query("select public.approve_content_version($1)", [versionId]);
    });
  });

  it("keeps suggestions and rules owner-only, and rules unique per brand", async () => {
    await asUser(db, alice, async () => {
      const { assetId, versionId } = await version();
      const reviewId = await review(assetId, versionId, "[]");
      // Only the worker creates suggestions.
      expect(
        await expectError(
          db,
          `insert into public.review_suggestions (user_id, review_id, asset_id, version_id, section_key, dimension, issue, rewrite) values ($1, $2, $3, $4, 's1', 'hook', 'x', '{}')`,
          [alice, reviewId, assetId, versionId],
        ),
      ).toBe("42501");
      const ins = "insert into public.learned_rules (user_id, brand_id, rule, source) values ($1, $2, $3, 'owner')";
      await db.query(ins, [alice, aliceBrand, "Say clients, not customers"]);
      expect(await expectError(db, ins, [alice, aliceBrand, "Say clients, not customers"])).toBe("23505");
      expect(await expectError(db, ins, [bob, aliceBrand, "Another rule here"])).toBe("42501");
    });
    await asUser(db, bob, async () => {
      const { rows } = await db.query("select rule from public.learned_rules");
      expect(rows).toEqual([]);
    });
  });
});

describe("privileges", () => {
  it("signed-in users cannot truncate application tables", async () => {
    await asUser(db, alice, async () => {
      for (const t of ["research_queries", "gate_overrides", "learned_rules", "review_suggestions"]) {
        expect(await expectError(db, `truncate public.${t}`), t).toBe("42501");
      }
    });
  });
});
