import { listProjects } from "@contentos/database";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Production Studio" };

const BRIEF_LABEL: Record<string, string> = {
  pending: "Brief awaiting approval",
  approved: "Brief approved",
  rejected: "Brief rejected",
  superseded: "Brief superseded",
};

export default async function ProductionPage() {
  const { db } = await requireSession();
  const projects = await listProjects(db);

  return (
    <section className="space-y-6">
      <header>
        <p className="eyebrow">Create</p>
        <h1 className="font-display text-4xl">Production Studio</h1>
        <p className="mt-2 text-sm text-muted">
          Projects start from an idea. Open an idea in the Idea Inbox and choose “Create project and brief”.
        </p>
      </header>

      {projects.length === 0 ? (
        <p className="card text-muted">
          No projects yet.{" "}
          <Link href="/ideas" className="underline">
            Go to the Idea Inbox
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-3">
          {projects.map((p) => {
            const latest = p.briefs[0];
            return (
              <li key={p.id}>
                <Link href={`/production/${p.id}`} className="card block hover:border-[var(--accent)]">
                  <p className="font-semibold">{p.title}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="chip">{latest ? `${BRIEF_LABEL[latest.approval_status]} · v${latest.version}` : "No brief yet"}</span>
                    {(p.settings.formats ?? []).map((f) => (
                      <span key={f} className="chip">
                        {f.replace("_", " ")}
                      </span>
                    ))}
                    <span className="chip">{new Date(p.created_at).toLocaleDateString()}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
