"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/research", label: "Overview" },
  { href: "/research/keywords", label: "Keywords" },
  { href: "/research/competitors", label: "Competitors" },
  { href: "/research/import", label: "Import posts & diagnostics" },
];

export function ResearchTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Research" className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
      {TABS.map((t) => {
        const active = t.href === "/research" ? path === "/research" || path.startsWith("/research/reports") : path.startsWith(t.href);
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
