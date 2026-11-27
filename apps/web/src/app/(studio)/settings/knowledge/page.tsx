import { listKnowledge } from "@contentos/database";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { KnowledgeManager } from "./knowledge-manager";

export const metadata: Metadata = { title: "Knowledge base" };

export default async function KnowledgePage() {
  const { db } = await requireSession();
  const page = await listKnowledge(db, { limit: 100 });
  return (
    <section className="space-y-6">
      <header>
        <p className="eyebrow">Settings</p>
        <h1 className="font-display text-4xl">Knowledge base</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Your example posts teach ContentOS your voice. Opinions, stories, experiences and facts give it real material.
          Facts, stories and experiences are only used once you mark them verified, so nothing unconfirmed ends up in
          your content.
        </p>
      </header>
      <KnowledgeManager entries={page.data} />
    </section>
  );
}
