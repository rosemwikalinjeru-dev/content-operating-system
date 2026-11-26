import "server-only";
import type { UserClient } from "@contentos/database";
import { AppError, isAllowedEmail } from "@contentos/shared";
import { redirect } from "next/navigation";
import { env } from "@/env";
import { createClient } from "@/lib/supabase/server";

export interface Session {
  db: UserClient;
  userId: string;
  email: string;
}

/**
 * Resolve the signed-in owner. Uses getUser(), which validates the JWT with Supabase Auth,
 * rather than trusting the cookie contents. Also re-checks the owner allowlist on every
 * request so removing an email revokes access immediately.
 */
async function resolveSession(): Promise<Session | null> {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user?.email) return null;
  if (!isAllowedEmail(data.user.email, env().ownerAllowlist)) return null;
  return { db, userId: data.user.id, email: data.user.email };
}

/** For Server Components / pages: redirect to login when not signed in. */
export async function requireSession(): Promise<Session> {
  const session = await resolveSession();
  if (!session) redirect("/login");
  return session;
}

/** For API route handlers: throw a structured 401. */
export async function requireApiSession(): Promise<Session> {
  const session = await resolveSession();
  if (!session) throw new AppError("UNAUTHORIZED", "Sign in required.");
  return session;
}
