import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, connect, createUser, defaultBrandId, expectError, type Db } from "./helpers";

let db: Db;
let alice: string;
let bob: string;
let aliceBrand: string;
let bobBrand: string;

beforeAll(async () => {
  db = await connect();
  alice = await createUser(db, `p2-alice-${Date.now()}@example.test`);
  bob = await createUser(db, `p2-bob-${Date.now()}@example.test`);
  aliceBrand = await defaultBrandId(db, alice);
  bobBrand = await defaultBrandId(db, bob);
});

afterAll(async () => {
  await db.end();
});

describe("research_queries", () => {
  it("is owner-only and rejects duplicates, bad platforms and cross-tenant brands", async () => {
    await asUser(db, alice, async () => {
      const ins = `insert into public.research_queries (user_id, brand_id, cluster_id, cluster_name, priority, kind, query, platforms)
                   values ($1, $2, 'E', 'Scaling', 'high', 'audience_language', $3, $4)`;
      await db.query(ins, [alice, aliceBrand, "business can't run without me", "{reddit,youtube}"]);
      expect(await expectError(db, ins, [alice, aliceBrand, "business can't run without me", "{reddit}"])).toBe("23505");
      expect(await expectError(db, ins, [alice, aliceBrand, "other query", "{myspace}"])).toBe("23514");
      expect(await expectError(db, ins, [alice, bobBrand, "x query", "{reddit}"])).toBe("23503");
      expect(await expectError(db, ins, [bob, bobBrand, "y query", "{reddit}"])).toBe("42501");
    });
  });

  it("users cannot see each other's queries", async () => {
    await asAdmin(db, async () => {
      await db.query(
        `insert into public.research_queries (user_id, brand_id, cluster_id, cluster_name, kind, query) values ($1, $2, 'A', 'A', 'concept', 'bob secret query')`,
        [bob, bobBrand],
      );
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: alice })]);
      await db.query("set local role authenticated");
      const { rows } = await db.query("select query from public.research_queries where query = 'bob secret query'");
      expect(rows).toEqual([]);
    });
  });
});

describe("competitors and sources", () => {
  it("competitors accept relationship types and reject unknown ones", async () => {
    await asUser(db, alice, async () => {
      const ins = `insert into public.competitors (user_id, brand_id, name, platform, profile_url, relationship) values ($1, $2, $3, 'linkedin', $4, $5)`;
      await db.query(ins, [alice, aliceBrand, "Justin Welsh", "https://www.linkedin.com/in/justinwelsh/", "craft_benchmark"]);
      expect(await expectError(db, ins, [alice, aliceBrand, "X", "https://x.test/a", "friend"])).toBe("23514");
    });
  });

  it("sources store outlier results with constrained tiers and baseline kinds", async () => {
    await asUser(db, alice, async () => {
      const ins = `insert into public.research_sources (user_id, brand_id, provider, content_hash, lift, outlier_tier, baseline_kind)
                   values ($1, $2, 'scrapecreators', $3, $4, $5, $6)`;
      await db.query(ins, [alice, aliceBrand, "h-p2-1", 3.2, "strong", "author"]);
      expect(await expectError(db, ins, [alice, aliceBrand, "h-p2-2", 1, "legendary", "author"])).toBe("23514");
      expect(await expectError(db, ins, [alice, aliceBrand, "h-p2-3", 1, "none", "vibes"])).toBe("23514");
    });
  });

  it("service_role can write research tables (background jobs)", async () => {
    await asAdmin(db, async () => {
      await db.query("set local role service_role");
      await db.query(
        `insert into public.research_queries (user_id, brand_id, cluster_id, cluster_name, kind, query) values ($1, $2, 'B', 'B', 'concept', 'svc query')`,
        [alice, aliceBrand],
      );
    });
  });
});
