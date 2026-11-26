import { Nav } from "@/components/nav";
import { requireSession } from "@/lib/auth";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireSession();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-[var(--border)] p-4 md:border-b-0 md:border-r">
        <p className="font-display mb-4 text-2xl">ContentOS</p>
        <Nav />
        <form action="/auth/signout" method="post" className="mt-6 hidden md:block">
          <p className="mb-2 truncate text-xs text-muted" title={email}>
            {email}
          </p>
          <button type="submit" className="btn-ghost">
            Sign out
          </button>
        </form>
      </aside>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
