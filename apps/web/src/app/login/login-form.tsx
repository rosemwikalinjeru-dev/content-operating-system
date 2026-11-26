"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

const initial: LoginState = { status: "idle" };

export function LoginForm({ error }: { error?: string }) {
  const [state, action, pending] = useActionState(sendMagicLink, initial);
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-medium" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        className="input"
        placeholder="you@example.com"
      />
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Sending…" : "Send sign-in link"}
      </button>
      <p role="status" className="min-h-5 text-sm text-muted">
        {state.status !== "idle" ? state.message : error}
      </p>
    </form>
  );
}
