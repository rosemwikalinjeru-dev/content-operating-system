import { getDefaultBrand, listLearnedRules } from "@contentos/database";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { RulesManager } from "./rules-manager";

export const metadata: Metadata = { title: "Voice rules" };

export default async function RulesPage() {
  const { db } = await requireSession();
  const brand = await getDefaultBrand(db);
  const rules = await listLearnedRules(db, brand.id);
  return (
    <section className="space-y-6">
      <header>
        <p className="eyebrow">Settings</p>
        <h1 className="font-display text-4xl">Voice rules</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          ContentOS proposes rules from your hand edits and the suggestions you reject. Nothing is used until you approve it.
          Approved rules guide every writer, revision and review. Turn one off at any time.
        </p>
      </header>
      <RulesManager rules={rules} />
    </section>
  );
}
