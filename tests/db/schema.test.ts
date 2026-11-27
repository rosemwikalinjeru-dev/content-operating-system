import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAdmin, asAnon, asUser, connect, createUser, defaultBrandId, expectError, type Db } from "./helpers";

let db: Db;
let alice: string;
let bob: string;
let aliceBrand: string;
let bobBrand: string;

const RLS_TABLES = [
  "user_settings", "brand_profiles", "brand_knowledge", "competitors", "monitoring_schedules",
  "research_sources", "research_reports", "research_report_sources", "content_ideas",
  "prompt_templates", "content_projects", "content_briefs", "production_jobs", "job_steps",
  "content_assets", "content_versions", "carousel_slides", "media_assets", "quality_reviews",
  "publishing_records", "performance_metrics", "provider_usage", "research_queries",
  "review_suggestions", "gate_overrides", "learned_rules", "carousel_designs",
];

beforeAll(async () => {
  db = await connect();
  alice = await createUser(db, `alice-${Date.now()}@example.test`);
  bob = await createUser(db, `bob-${Date.now()}@example.test`);
  aliceBrand = await defaultBrandId(db, alice);
  bobBrand = await defaultBrandId(db, bob);
});

afterAll(async () => {
  await db.end();
});

async function insertIdea(userId: string, brandId: string, title = "Idea"): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.content_ideas (user_id, brand_id, title, raw_input) values ($1, $2, $3, 'raw') returning id",
    [userId, brandId, title],
  );
  return rows[0]!.id;
}

async function insertProject(userId: string, brandId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.content_projects (user_id, brand_id, title, production_mode)
     values ($1, $2, 'Project', 'idea_to_content') returning id`,
    [userId, brandId],
  );
  return rows[0]!.id;
}

describe("schema setup", () => {
  it("enables RLS on every user-owned table", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    const tables = new Map(rows.map((r) => [r.relname, r.relrowsecurity]));
    for (const t of RLS_TABLES) expect(tables.get(t), t).toBe(true);
    // Every public table must be in the RLS list (catches new tables added without RLS).
    expect([...tables.keys()].sort()).toEqual([...RLS_TABLES].sort());
  });

  it("provisions settings and one default brand on signup", async () => {
    const { rows } = await db.query(
      "select count(*)::int as n from public.brand_profiles where user_id = $1 and is_default",
      [alice],
    );
    expect(rows[0].n).toBe(1);
    const settings = await db.query("select budget_daily_usd from public.user_settings where user_id = $1", [alice]);
    expect(Number(settings.rows[0].budget_daily_usd)).toBe(5);
  });
});

describe("tenant isolation", () => {
  it("harness runs queries as the authenticated role with the user's JWT", async () => {
    await asUser(db, alice, async () => {
      const { rows } = await db.query("select current_user as role, auth.uid() as uid");
      expect(rows[0]).toEqual({ role: "authenticated", uid: alice });
    });
  });

  it("a user sees only their own rows", async () => {
    await asAdmin(db, async () => {
      await insertIdea(alice, aliceBrand, "Alice idea");
      await insertIdea(bob, bobBrand, "Bob idea");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: alice })]);
      await db.query("set local role authenticated");
      const ideas = await db.query("select title from public.content_ideas");
      expect(ideas.rows.map((r) => r.title)).toEqual(["Alice idea"]);
      const brands = await db.query("select id from public.brand_profiles");
      expect(brands.rows.map((r) => r.id)).toEqual([aliceBrand]);
    });
  });

  it("a user cannot insert rows owned by someone else", async () => {
    await asUser(db, alice, async () => {
      const code = await expectError(
        db,
        "insert into public.content_ideas (user_id, brand_id, title, raw_input) values ($1, $2, 'x', 'x')",
        [bob, bobBrand],
      );
      expect(code).toBe("42501"); // insufficient_privilege (RLS with check)
    });
  });

  it("composite FKs block attaching own rows to another user's parent", async () => {
    await asUser(db, alice, async () => {
      // Alice owns the row, but points it at Bob's brand. RLS alone would allow this.
      const code = await expectError(
        db,
        "insert into public.content_ideas (user_id, brand_id, title, raw_input) values ($1, $2, 'x', 'x')",
        [alice, bobBrand],
      );
      expect(code).toBe("23503"); // foreign_key_violation
    });
  });

  it("a user cannot update or reassign another user's rows", async () => {
    await asAdmin(db, async () => {
      const bobIdea = await insertIdea(bob, bobBrand, "Bob idea");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: alice })]);
      await db.query("set local role authenticated");
      const res = await db.query("update public.content_ideas set title = 'pwned' where id = $1", [bobIdea]);
      expect(res.rowCount).toBe(0);
      const own = await insertIdea(alice, aliceBrand);
      const code = await expectError(db, "update public.content_ideas set user_id = $1 where id = $2", [bob, own]);
      expect(code).toBe("42501");
    });
  });

  it("the anon role has no access to application tables", async () => {
    await asAnon(db, async () => {
      const code = await expectError(db, "select * from public.content_ideas");
      expect(code).toBe("42501");
    });
  });

  it("brand profiles cannot be hard-deleted from the client", async () => {
    await asUser(db, alice, async () => {
      const code = await expectError(db, "delete from public.brand_profiles where id = $1", [aliceBrand]);
      expect(code).toBe("42501");
    });
  });

  it("only one default brand per user", async () => {
    await asUser(db, alice, async () => {
      const code = await expectError(
        db,
        "insert into public.brand_profiles (user_id, name, is_default) values ($1, 'Second', true)",
        [alice],
      );
      expect(code).toBe("23505");
    });
  });
});

describe("evidence and ledgers are append-only", () => {
  it("research sources cannot be updated or deleted by the client", async () => {
    await asUser(db, alice, async () => {
      const { rows } = await db.query(
        `insert into public.research_sources (user_id, brand_id, provider, content_hash)
         values ($1, $2, 'test', 'h1') returning id`,
        [alice, aliceBrand],
      );
      expect(await expectError(db, "update public.research_sources set author = 'x' where id = $1", [rows[0].id])).toBe("42501");
      expect(await expectError(db, "delete from public.research_sources where id = $1", [rows[0].id])).toBe("42501");
    });
  });

  it("duplicate research sources are rejected per brand", async () => {
    await asUser(db, alice, async () => {
      const sql = `insert into public.research_sources (user_id, brand_id, provider, content_hash) values ($1, $2, 'test', 'dup')`;
      await db.query(sql, [alice, aliceBrand]);
      expect(await expectError(db, sql, [alice, aliceBrand])).toBe("23505");
    });
  });

  it("provider usage is insert-only", async () => {
    await asUser(db, alice, async () => {
      const { rows } = await db.query(
        `insert into public.provider_usage (user_id, provider, model, task_type, status)
         values ($1, 'anthropic', 'model-x', 'idea_analysis', 'success') returning id`,
        [alice],
      );
      expect(await expectError(db, "update public.provider_usage set actual_cost = 0 where id = $1", [rows[0].id])).toBe("42501");
      expect(await expectError(db, "delete from public.provider_usage where id = $1", [rows[0].id])).toBe("42501");
    });
  });
});

describe("briefs and versions", () => {
  it("approved briefs are immutable; superseding is allowed", async () => {
    await asAdmin(db, async () => {
      const project = await insertProject(alice, aliceBrand);
      const { rows } = await db.query(
        `insert into public.content_briefs (user_id, project_id, brief, approval_status, approved_at)
         values ($1, $2, '{"idea":"a"}', 'approved', now()) returning id`,
        [alice, project],
      );
      const id = rows[0].id;
      expect(await expectError(db, `update public.content_briefs set brief = '{"idea":"b"}' where id = $1`, [id])).toBe("P0001");
      expect(await expectError(db, "update public.content_briefs set approval_status = 'pending', approved_at = null where id = $1", [id])).toBe("P0001");
      await db.query("update public.content_briefs set approval_status = 'superseded' where id = $1", [id]);
      expect(await expectError(db, "update public.content_briefs set approval_status = 'approved' where id = $1", [id])).toBe("P0001");
    });
  });

  it("only one approved brief per project", async () => {
    await asAdmin(db, async () => {
      const project = await insertProject(alice, aliceBrand);
      const sql = `insert into public.content_briefs (user_id, project_id, version, brief, approval_status, approved_at)
                   values ($1, $2, $3, '{}', 'approved', now())`;
      await db.query(sql, [alice, project, 1]);
      expect(await expectError(db, sql, [alice, project, 2])).toBe("23505");
    });
  });

  it("version content is immutable and only one version per asset is approved", async () => {
    await asAdmin(db, async () => {
      const project = await insertProject(alice, aliceBrand);
      const asset = await db.query(
        `insert into public.content_assets (user_id, project_id, platform, format) values ($1, $2, 'linkedin', 'post') returning id`,
        [alice, project],
      );
      const assetId = asset.rows[0].id;
      const v1 = await db.query(
        `insert into public.content_versions (user_id, asset_id, version, body, created_by, status)
         values ($1, $2, 1, '{"text":"v1"}', 'human', 'approved') returning id`,
        [alice, assetId],
      );
      expect(await expectError(db, `update public.content_versions set body = '{"text":"edited"}' where id = $1`, [v1.rows[0].id])).toBe("P0001");
      expect(
        await expectError(
          db,
          `insert into public.content_versions (user_id, asset_id, version, body, created_by, status)
           values ($1, $2, 2, '{}', 'human', 'approved')`,
          [alice, assetId],
        ),
      ).toBe("23505");
    });
  });

  it("AI-generated versions must record their model", async () => {
    await asAdmin(db, async () => {
      const project = await insertProject(alice, aliceBrand);
      const asset = await db.query(
        `insert into public.content_assets (user_id, project_id, platform, format) values ($1, $2, 'x', 'thread') returning id`,
        [alice, project],
      );
      const code = await expectError(
        db,
        `insert into public.content_versions (user_id, asset_id, version, body, created_by) values ($1, $2, 1, '{}', 'ai')`,
        [alice, asset.rows[0].id],
      );
      expect(code).toBe("23514");
    });
  });
});

describe("jobs", () => {
  it("idempotency keys are unique per user", async () => {
    await asUser(db, alice, async () => {
      const sql = `insert into public.production_jobs (user_id, job_type, idempotency_key) values ($1, 'brief', 'k-1')`;
      await db.query(sql, [alice]);
      expect(await expectError(db, sql, [alice])).toBe("23505");
    });
  });

  it("monitoring cannot be enabled without approval", async () => {
    await asUser(db, alice, async () => {
      const code = await expectError(
        db,
        `insert into public.monitoring_schedules (user_id, brand_id, schedule_type, enabled) values ($1, $2, 'topic', true)`,
        [alice, aliceBrand],
      );
      expect(code).toBe("23514");
    });
  });
});

describe("updated_at", () => {
  it("is maintained by trigger", async () => {
    await asAdmin(db, async () => {
      const id = await insertIdea(alice, aliceBrand);
      await db.query("update public.content_ideas set updated_at = '2000-01-01' where id = $1", [id]);
      const { rows } = await db.query("select updated_at > now() - interval '1 minute' as fresh from public.content_ideas where id = $1", [id]);
      expect(rows[0].fresh).toBe(true);
    });
  });
});

describe("storage", () => {
  it("buckets are private", async () => {
    const { rows } = await db.query("select id, public from storage.buckets where id in ('uploads','renders','brand') order by id");
    expect(rows).toEqual([
      { id: "brand", public: false },
      { id: "renders", public: false },
      { id: "uploads", public: false },
    ]);
  });

  it("users can only write inside their own folder and cannot write renders", async () => {
    await asUser(db, alice, async () => {
      await db.query("insert into storage.objects (bucket_id, name) values ('uploads', $1)", [`${alice}/a.mp4`]);
      expect(await expectError(db, "insert into storage.objects (bucket_id, name) values ('uploads', $1)", [`${bob}/a.mp4`])).toBe("42501");
      expect(await expectError(db, "insert into storage.objects (bucket_id, name) values ('renders', $1)", [`${alice}/r.mp4`])).toBe("42501");
    });
  });

  it("users cannot read another user's objects", async () => {
    await asAdmin(db, async () => {
      await db.query("insert into storage.objects (bucket_id, name) values ('uploads', $1)", [`${bob}/secret.mp4`]);
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: alice })]);
      await db.query("set local role authenticated");
      const { rows } = await db.query("select name from storage.objects");
      expect(rows).toEqual([]);
    });
  });

  it("media asset paths must be namespaced by owner", async () => {
    await asUser(db, alice, async () => {
      const code = await expectError(
        db,
        `insert into public.media_assets (user_id, brand_id, kind, role, storage_bucket, storage_path, mime_type)
         values ($1, $2, 'video', 'original_upload', 'uploads', $3, 'video/mp4')`,
        [alice, aliceBrand, `${bob}/x.mp4`],
      );
      expect(code).toBe("23514");
    });
  });
});
