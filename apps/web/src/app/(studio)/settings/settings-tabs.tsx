"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "Brand DNA" },
  { href: "/settings/knowledge", label: "Knowledge base" },
  { href: "/settings/usage", label: "Budgets & usage" },
];

export function SettingsTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Settings" className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
      {TABS.map((t) => {
        const active = t.href === "/settings" ? path === "/settings" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`btn-ghost ${active ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
