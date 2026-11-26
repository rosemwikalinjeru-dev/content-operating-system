"use server";

import { isAllowedEmail, logger } from "@contentos/shared";
import { z } from "zod";
import { EnvError, env } from "@/env";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  status: "idle" | "sent" | "error";
  message?: string;
}

const Email = z.email().max(320);

const SENT: LoginState = { status: "sent", message: "If this email is registered, a sign-in link is on its way." };

/**
 * Send a magic link. The response is the same whether or not the email is allowed, so the
 * form cannot be used to discover the owner's address. Only allowlisted emails get a link.
 * Never throws: every failure becomes a readable message plus a structured log line.
 */
export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ref = crypto.randomUUID().slice(0, 8);
  try {
    const parsed = Email.safeParse(String(formData.get("email") ?? "").trim());
    if (!parsed.success) return { status: "error", message: "Enter a valid email address." };

    const e = env();
    if (!isAllowedEmail(parsed.data, e.ownerAllowlist)) {
      logger.warn("login_rejected_not_allowlisted", { ref });
      return SENT;
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: { emailRedirectTo: new URL("/auth/callback", e.NEXT_PUBLIC_SITE_URL).toString() },
    });
    if (error) {
      logger.error("login_otp_failed", { ref, code: error.code, status: error.status, message: error.message });
      if (error.status === 429) {
        return { status: "error", message: "Too many sign-in emails were requested. Wait about 15 minutes and try again." };
      }
      return { status: "error", message: `Supabase could not send the link (${error.code ?? error.status}). Ref ${ref}.` };
    }
    return SENT;
  } catch (err) {
    if (err instanceof EnvError) {
      // Variable names are public (see .env.example); values are never shown.
      logger.error("config_invalid", { ref, fields: err.fields });
      return {
        status: "error",
        message: `Server configuration problem: ${err.fields.join(", ")} is missing or invalid in Vercel. Fix it, then redeploy. Ref ${ref}.`,
      };
    }
    logger.error("login_unexpected_error", {
      ref,
      error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
    });
    return { status: "error", message: `Unexpected error while sending the link. Ref ${ref}.` };
  }
}
