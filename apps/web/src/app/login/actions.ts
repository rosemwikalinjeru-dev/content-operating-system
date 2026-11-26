"use server";

import { isAllowedEmail, logger } from "@contentos/shared";
import { z } from "zod";
import { env } from "@/env";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  status: "idle" | "sent" | "error";
  message?: string;
}

const Email = z.email().max(320);

/**
 * Send a magic link. The response is the same whether or not the email is allowed, so the
 * form cannot be used to discover the owner's address. Only allowlisted emails get a link.
 */
export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = Email.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { status: "error", message: "Enter a valid email address." };

  const e = env();
  const sent: LoginState = { status: "sent", message: "If this email is registered, a sign-in link is on its way." };
  if (!isAllowedEmail(parsed.data, e.ownerAllowlist)) {
    logger.warn("login_rejected_not_allowlisted");
    return sent;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: new URL("/auth/callback", e.NEXT_PUBLIC_SITE_URL).toString() },
  });
  if (error) {
    logger.error("login_otp_failed", { code: error.code, status: error.status });
    return { status: "error", message: "Could not send the sign-in link. Try again shortly." };
  }
  return sent;
}
