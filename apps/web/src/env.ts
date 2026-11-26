import "server-only";
import { parseAllowlist } from "@contentos/shared";
import { z } from "zod";

const EnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url(),
  OWNER_EMAILS: z.string().default(""),
});

export type Env = z.infer<typeof EnvSchema> & { ownerAllowlist: Set<string> };

let cached: Env | undefined;

/** Validated server environment. Throws a clear error on misconfiguration. */
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    OWNER_EMAILS: process.env.OWNER_EMAILS,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}. See apps/web/.env.example.`);
  }
  cached = { ...parsed.data, ownerAllowlist: parseAllowlist(parsed.data.OWNER_EMAILS) };
  return cached;
}
