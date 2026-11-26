import "server-only";
import type { UserClient } from "@contentos/database";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/env";

/** User-scoped Supabase client for Server Components, Route Handlers and Server Actions. */
export async function createClient(): Promise<UserClient> {
  const cookieStore = await cookies();
  const e = env();
  return createServerClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there. The proxy refreshes
          // the session on every request, so this is safe to ignore.
        }
      },
    },
  });
}
