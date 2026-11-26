/**
 * Database test setup.
 *
 * If TEST_DATABASE_URL is set (CI), migrations run against that server (must be a superuser
 * connection to a disposable database). Otherwise an ephemeral Postgres cluster is created
 * in a temp directory using the local Postgres binaries and destroyed afterwards.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";
import type { TestProject } from "vitest/node";

const ROOT = resolve(import.meta.dirname, "../..");
const PG_BIN = process.env.PG_BIN ?? "/usr/lib/postgresql/16/bin";

let dataDir: string | undefined;

function asPostgresUser(cmd: string, args: string[]): void {
  const isRoot = process.getuid?.() === 0;
  if (isRoot) execFileSync("runuser", ["-u", "postgres", "--", cmd, ...args], { stdio: "pipe" });
  else execFileSync(cmd, args, { stdio: "pipe" });
}

function startEphemeralCluster(): string {
  dataDir = mkdtempSync(join(tmpdir(), "contentos-pg-"));
  chmodSync(dataDir, 0o777);
  const pgData = join(dataDir, "data");
  const port = 54_000 + Math.floor(Math.random() * 1000);
  if (process.getuid?.() === 0) execFileSync("chown", ["-R", "postgres", dataDir]);
  asPostgresUser(join(PG_BIN, "initdb"), ["-D", pgData, "-U", "postgres", "--auth=trust", "-E", "UTF8"]);
  asPostgresUser(join(PG_BIN, "pg_ctl"), [
    "-D", pgData, "-l", join(dataDir, "pg.log"), "-w",
    "-o", `-p ${port} -k ${dataDir} -c listen_addresses=''`, "start",
  ]);
  return `postgresql://postgres@/postgres?host=${encodeURIComponent(dataDir)}&port=${port}`;
}

export async function setup(project: TestProject): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? startEphemeralCluster();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(readFileSync(join(ROOT, "tests/db/supabase-stub.sql"), "utf8"));
    const dir = join(ROOT, "supabase/migrations");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      try {
        await client.query(readFileSync(join(dir, file), "utf8"));
      } catch (err) {
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
  project.provide("databaseUrl", url);
}

export async function teardown(): Promise<void> {
  if (!dataDir) return;
  try {
    asPostgresUser(join(PG_BIN, "pg_ctl"), ["-D", join(dataDir, "data"), "-m", "immediate", "stop"]);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
