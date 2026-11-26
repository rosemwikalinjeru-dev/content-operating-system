import { getDefaultBrand } from "@contentos/database";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { BrandEditor } from "./brand-editor";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { db } = await requireSession();
  const brand = await getDefaultBrand(db);
  return (
    <section className="space-y-6">
      <header>
        <p className="eyebrow">Settings</p>
        <h1 className="font-display text-4xl">Brand DNA</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Every generation will use these rules. Changes take effect only when you save — agents cannot edit
          your brand profile.
        </p>
      </header>
      <BrandEditor brand={brand} />
      <div className="card text-sm text-muted">
        Models, providers, API credentials and budgets are configured in Phase 1. Credentials are stored as
        platform secrets, never in this app.
      </div>
    </section>
  );
}
