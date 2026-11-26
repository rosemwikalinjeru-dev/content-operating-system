import pg from "pg";
import { inject } from "vitest";

export type Db = pg.Client;

export async function connect(): Promise<Db> {
  const client = new pg.Client({ connectionString: inject("databaseUrl") });
  await client.connect();
  return client;
}

/** Create an auth user as the superuser; the signup trigger provisions brand + settings. */
export async function createUser(db: Db, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [email],
  );
  return rows[0]!.id;
}

/**
 * Run `fn` inside a transaction as the `authenticated` role with the given user's JWT,
 * exactly as PostgREST does. Always rolls back so tests stay independent.
 */
export async function asUser<T>(db: Db, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await db.query("set local role authenticated");
    return await fn();
  } finally {
    await db.query("rollback");
  }
}

export async function asAnon<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role anon");
    return await fn();
  } finally {
    await db.query("rollback");
  }
}

/** Run as superuser inside a rolled-back transaction (for seeding cross-tenant fixtures). */
export async function asAdmin<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    return await fn();
  } finally {
    await db.query("rollback");
  }
}

export async function defaultBrandId(db: Db, userId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "select id from public.brand_profiles where user_id = $1 and is_default",
    [userId],
  );
  return rows[0]!.id;
}

/** Expect a query to fail; returns the Postgres error code. */
export async function expectError(db: Db, sql: string, params: unknown[] = []): Promise<string> {
  await db.query("savepoint expect_error");
  try {
    await db.query(sql, params);
  } catch (err) {
    await db.query("rollback to savepoint expect_error");
    return (err as { code?: string }).code ?? "unknown";
  }
  await db.query("release savepoint expect_error");
  throw new Error(`Expected query to fail: ${sql}`);
}
