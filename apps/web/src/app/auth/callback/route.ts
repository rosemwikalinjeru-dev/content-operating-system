import { isAllowedEmail, logger } from "@contentos/shared";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import { createClient } from "@/lib/supabase/server";

/** Magic-link landing: exchange the code for a session, then enforce the owner allowlist. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const site = env().NEXT_PUBLIC_SITE_URL;
  if (!code) return NextResponse.redirect(new URL("/login?error=link_invalid", site));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    logger.warn("auth_callback_failed", { code: error?.code });
    return NextResponse.redirect(new URL("/login?error=link_invalid", site));
  }
  if (!isAllowedEmail(data.user.email, env().ownerAllowlist)) {
    await supabase.auth.signOut();
    logger.warn("auth_callback_not_allowlisted", { userId: data.user.id });
    return NextResponse.redirect(new URL("/login?error=not_allowed", site));
  }
  // Always land on a fixed internal path: no user-controlled redirect targets.
  return NextResponse.redirect(new URL("/", site));
}
