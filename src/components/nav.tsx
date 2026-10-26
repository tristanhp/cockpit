"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Aujourd'hui" },
  { href: "/taches", label: "Tâches" },
  { href: "/cockpit", label: "Cockpit" },
  { href: "/reglages", label: "Réglages" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-10 flex items-center gap-1 overflow-x-auto border-b border-border bg-bg/90 px-4 py-2 backdrop-blur md:h-screen md:w-52 md:shrink-0 md:flex-col md:items-stretch md:overflow-visible md:border-b-0 md:border-r md:px-3 md:py-6">
      <div className="mr-2 shrink-0 text-sm font-semibold tracking-tight md:mb-6 md:mr-0 md:px-3">
        🧭<span className="hidden sm:inline md:inline"> Cockpit</span>
      </div>
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors ${
              active ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2 hover:text-text"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
