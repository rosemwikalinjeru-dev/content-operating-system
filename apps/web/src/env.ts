import "server-only";
import { parseAllowlist } from "@contentos/shared";
import { z } from "zod";

// Values are trimmed first: pasted dashboard values often carry a trailing space or newline.
const url = z.string().trim().pipe(z.url());

const EnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1),
  NEXT_PUBLIC_SITE_URL: url,
  OWNER_EMAILS: z.string().default(""),
});

export type Env = z.infer<typeof EnvSchema> & { ownerAllowlist: Set<string> };

/** Thrown when required configuration is missing or invalid. Lists variable NAMES only, never values. */
export class EnvError extends Error {
  readonly fields: string[];
  constructor(fields: string[]) {
    super(`Invalid environment configuration: ${fields.join(", ")}. See apps/web/.env.example.`);
    this.name = "EnvError";
    this.fields = fields;
  }
}

/** Pure parser, exported for tests. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = EnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? source.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: source.NEXT_PUBLIC_SITE_URL,
    OWNER_EMAILS: source.OWNER_EMAILS,
  });
  if (!parsed.success) {
    throw new EnvError([...new Set(parsed.error.issues.map((i) => String(i.path[0])))]);
  }
  return { ...parsed.data, ownerAllowlist: parseAllowlist(parsed.data.OWNER_EMAILS) };
}

let cached: Env | undefined;

/** Validated server environment. Throws EnvError on misconfiguration. */
export function env(): Env {
  // NEXT_PUBLIC_* must be referenced literally so Next.js can inline them at build time.
  cached ??= parseEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    OWNER_EMAILS: process.env.OWNER_EMAILS,
  });
  return cached;
}
