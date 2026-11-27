import { countIdeasByStatus, getDefaultBrand, listProjects, type ProjectView } from "@contentos/database";
import Link from "next/link";
import { requireSession } from "@/lib/auth";

export default async function DashboardPage() {
  const { db } = await requireSession();
  const [counts, brand, projects] = await Promise.all([countIdeasByStatus(db), getDefaultBrand(db), listProjects(db, 50)]);
  const awaiting = projects.filter((p) => p.briefs[0]?.approval_status === "pending").length;
  const brandConfigured = Boolean(brand.positioning) && brand.voice_profile.principles.length > 0;

  const stats = [
    { label: "Ideas in inbox", value: counts.inbox ?? 0, href: "/ideas?status=inbox" },
    { label: "Ideas in development", value: counts.developing ?? 0, href: "/ideas?status=developing" },
    { label: "Ideas briefed", value: counts.briefed ?? 0, href: "/ideas?status=briefed" },
    { label: "Briefs awaiting approval", value: awaiting, href: "/production" },
  ];

  return (
    <section className="space-y-8">
      <header>
        <p className="eyebrow">{brand.name}</p>
        <h1 className="font-display text-4xl">Your content production</h1>
      </header>

      {!brandConfigured && (
        <div className="card border-l-4 border-l-[var(--color-gold)]">
          <p className="font-semibold">Brand DNA is not configured yet.</p>
          <p className="mb-3 text-sm text-muted">Generation in later phases uses your positioning and voice rules.</p>
          <Link href="/settings" className="btn-primary inline-block">
            Configure Brand DNA
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card block hover:border-[var(--accent)]">
            <p className="metric text-4xl">{s.value}</p>
            <p className="text-sm text-muted">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl">Projects</h2>
          <Link href="/production" className="text-sm underline">
            All projects
          </Link>
        </div>
        {projects.length === 0 ? (
          <p className="card text-muted">No projects yet. Develop an idea from the Inbox to start one.</p>
        ) : (
          <ul className="space-y-2">
            {projects.slice(0, 6).map((p) => (
              <li key={p.id}>
                <Link href={`/production/${p.id}`} className="card flex flex-col gap-1 hover:border-[var(--accent)] sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-semibold">{p.title}</span>
                  <span className="chip">{stage(p)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
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

function stage(p: ProjectView): string {
  const latest = p.briefs[0];
  if (!latest) return "Needs a brief";
  if (latest.approval_status === "pending") return "Brief awaiting your approval";
  const approved = p.briefs.some((b) => b.approval_status === "approved");
  if (!approved) return "Brief rejected — write a new one";
  if (p.status === "in_production") return "Writing";
  if (p.status === "approved") return "Approved";
  return "Brief approved — ready to write";
}
