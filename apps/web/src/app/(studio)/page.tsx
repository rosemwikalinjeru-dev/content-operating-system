import { countIdeasByStatus, getDefaultBrand } from "@contentos/database";
import Link from "next/link";
import { requireSession } from "@/lib/auth";

export default async function DashboardPage() {
  const { db } = await requireSession();
  const [counts, brand] = await Promise.all([countIdeasByStatus(db), getDefaultBrand(db)]);
  const brandConfigured = Boolean(brand.positioning) && brand.voice_profile.principles.length > 0;

  const stats = [
    { label: "Ideas in inbox", value: counts.inbox ?? 0, href: "/ideas?status=inbox" },
    { label: "Ideas in development", value: counts.developing ?? 0, href: "/ideas?status=developing" },
    { label: "Ideas briefed", value: counts.briefed ?? 0, href: "/ideas?status=briefed" },
  ];

  return (
    <section className="space-y-8">
      <header>
        <p className="eyebrow">{brand.name}</p>
        <h1 className="font-display text-4xl">Your content production</h1>
      </header>

      {!brandConfigured && (
        <div className="card border-[var(--color-gold)]">
          <p className="font-semibold">Brand DNA is not configured yet.</p>
          <p className="mb-3 text-sm text-muted">Generation in later phases uses your positioning and voice rules.</p>
          <Link href="/settings" className="btn-primary inline-block">
            Configure Brand DNA
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card block hover:border-[var(--accent)]">
            <p className="font-display text-4xl">{s.value}</p>
            <p className="text-sm text-muted">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="card">
        <p className="mb-1 font-semibold">Capture an idea</p>
        <p className="mb-3 text-sm text-muted">Ideas wait in the inbox until you develop them into a brief.</p>
        <Link href="/ideas" className="btn-primary inline-block">
          Open Idea Inbox
        </Link>
      </div>
    </section>
  );
}
