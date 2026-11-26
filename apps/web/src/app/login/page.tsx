import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  not_allowed: "This account is not allowed to use ContentOS.",
  link_invalid: "That sign-in link is invalid or has expired. Request a new one.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="card w-full max-w-sm">
        <p className="eyebrow">ContentOS</p>
        <h1 className="font-display mb-6 text-3xl">Sign in</h1>
        <LoginForm error={error ? ERRORS[error] : undefined} />
      </div>
    </main>
  );
}
