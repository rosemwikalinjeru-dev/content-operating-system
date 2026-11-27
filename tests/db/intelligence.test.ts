import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, connect, createUser, defaultBrandId, expectError, type Db } from "./helpers";

let db: Db;
let alice: string;
let bob: string;
let aliceBrand: string;
let bobBrand: string;

beforeAll(async () => {
  db = await connect();
  alice = await createUser(db, `p1-alice-${Date.now()}@example.test`);
  bob = await createUser(db, `p1-bob-${Date.now()}@example.test`);
  aliceBrand = await defaultBrandId(db, alice);
  bobBrand = await defaultBrandId(db, bob);
});

afterAll(async () => {
  await db.end();
});

async function knowledge(userId: string, brandId: string, kind: string, title: string, body: string, verified = false) {
  await db.query(
    `insert into public.brand_knowledge (user_id, brand_id, kind, title, body, verified) values ($1, $2, $3, $4, $5, $6)`,
    [userId, brandId, kind, title, body, verified],
  );
}

describe("search_brand_knowledge", () => {
  it("ranks matches and excludes unverified facts, stories and experiences", async () => {
    await asAdmin(db, async () => {
      await knowledge(alice, aliceBrand, "opinion", "Review requests", "Ask happy customers for reviews within hours");
      await knowledge(alice, aliceBrand, "fact", "Unverified review stat", "Reviews raise bookings by a lot");
      await knowledge(alice, aliceBrand, "story", "Verified review story", "A salon client forgot to ask for reviews", true);
      await knowledge(alice, aliceBrand, "opinion", "Unrelated", "Invoices and payments");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: alice })]);
      await db.query("set local role authenticated");
      const { rows } = await db.query("select title from public.search_brand_knowledge($1, 'reviews', 10)", [aliceBrand]);
      const titles = rows.map((r) => r.title);
      expect(titles).toContain("Review requests");
      expect(titles).toContain("Verified review story");
      expect(titles).not.toContain("Unverified review stat");
      expect(titles).not.toContain("Unrelated");
    });
  });

  it("never returns another user's knowledge", async () => {
    await asAdmin(db, async () => {
      await knowledge(bob, bobBrand, "opinion", "Bob reviews", "reviews reviews reviews");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: alice })]);
      await db.query("set local role authenticated");
      const { rows } = await db.query("select title from public.search_brand_knowledge($1, 'reviews', 10)", [bobBrand]);
      expect(rows).toEqual([]);
    });
  });

  it("handles free-text queries with punctuation safely", async () => {
    await asUser(db, alice, async () => {
      const { rows } = await db.query(
        "select count(*)::int as n from public.search_brand_knowledge($1, $2, 5)",
        [aliceBrand, `"what time do you open?" -- ' or 1=1`],
      );
      expect(rows[0].n).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("ai_spend", () => {
  it("sums actual cost (falling back to estimate), excluding blocked calls, per user and project", async () => {
    await asAdmin(db, async () => {
      const project = await db.query(
        `insert into public.content_projects (user_id, brand_id, title, production_mode) values ($1, $2, 'P', 'idea_to_content') returning id`,
        [alice, aliceBrand],
      );
      const p = project.rows[0].id;
      const ins = `insert into public.provider_usage (user_id, project_id, provider, model, task_type, status, estimated_cost, actual_cost)
                   values ($1, $2, 'anthropic', 'm', 't', $3, $4, $5)`;
      await db.query(ins, [alice, p, "success", 0.02, 0.01]);
      await db.query(ins, [alice, p, "error", 0.03, null]);
      await db.query(ins, [alice, null, "blocked_budget", 0.5, null]);
      await db.query(ins, [bob, null, "success", 9, 9]);

      const total = await db.query("select public.ai_spend($1, now() - interval '1 day') as s", [alice]);
      expect(Number(total.rows[0].s)).toBeCloseTo(0.04, 6);
      const perProject = await db.query("select public.ai_spend($1, now() - interval '1 day', $2) as s", [alice, p]);
      expect(Number(perProject.rows[0].s)).toBeCloseTo(0.04, 6);
    });
  });
});

describe("approve_brief", () => {
  it("approves a pending brief and supersedes the previous approval atomically", async () => {
    await asAdmin(db, async () => {
      const project = await db.query(
        `insert into public.content_projects (user_id, brand_id, title, production_mode) values ($1, $2, 'P', 'idea_to_content') returning id`,
        [alice, aliceBrand],
      );
      const p = project.rows[0].id;
      const v1 = await db.query(
        `insert into public.content_briefs (user_id, project_id, version, brief) values ($1, $2, 1, '{"v":1}') returning id`,
        [alice, p],
      );
      const v2 = await db.query(
        `insert into public.content_briefs (user_id, project_id, version, brief) values ($1, $2, 2, '{"v":2}') returning id`,
        [alice, p],
      );
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: alice })]);
      await db.query("set local role authenticated");

      await db.query("select public.approve_brief($1)", [v1.rows[0].id]);
      await db.query("select public.approve_brief($1)", [v2.rows[0].id]);
      const { rows } = await db.query(
        "select version, approval_status from public.content_briefs where project_id = $1 order by version",
        [p],
      );
      expect(rows).toEqual([
        { version: 1, approval_status: "superseded" },
        { version: 2, approval_status: "approved" },
      ]);
      // Approving again is refused; approved content stays immutable.
      expect(await expectError(db, "select public.approve_brief($1)", [v2.rows[0].id])).toBe("P0001");
    });
  });

  it("cannot approve another user's brief", async () => {
    await asAdmin(db, async () => {
      const project = await db.query(
        `insert into public.content_projects (user_id, brand_id, title, production_mode) values ($1, $2, 'P', 'idea_to_content') returning id`,
        [bob, bobBrand],
      );
      const b = await db.query(
        `insert into public.content_briefs (user_id, project_id, brief) values ($1, $2, '{}') returning id`,
        [bob, project.rows[0].id],
      );
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: alice })]);
      await db.query("set local role authenticated");
      expect(await expectError(db, "select public.approve_brief($1)", [b.rows[0].id])).toBe("P0002");
    });
  });
});

describe("service_role grants", () => {
  it("background jobs (service_role) can read and write application tables", async () => {
    await asAdmin(db, async () => {
      await db.query("set local role service_role");
      const { rows } = await db.query("select count(*)::int as n from public.production_jobs");
      expect(rows[0].n).toBeGreaterThanOrEqual(0);
      await db.query(
        `insert into public.provider_usage (user_id, provider, model, task_type, status) values ($1, 'anthropic', 'm', 't', 'success')`,
        [alice],
      );
    });
  });

  it("the anon role still has no access", async () => {
    await db.query("begin");
    try {
      await db.query("set local role anon");
      expect(await expectError(db, "select 1 from public.production_jobs limit 1")).toBe("42501");
    } finally {
      await db.query("rollback");
    }
  });
});
