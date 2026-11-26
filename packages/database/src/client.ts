import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A Supabase client authenticated AS THE USER (anon/publishable key + session cookie).
 * Every repository function takes this, so RLS applies to every query. The service-role
 * client is deliberately not exported from this package.
 *
 * Typed as an untyped client for now; replace with generated types
 * (`supabase gen types typescript`) once the project is linked.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UserClient = SupabaseClient<any, "public", "public", any, any>;
