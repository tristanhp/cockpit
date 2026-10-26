"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { openPalette } from "./command-palette";

const LINKS = [
  { href: "/", label: "Aujourd'hui", short: "Jour", icon: "M4 6h16M4 12h10M4 18h7" },
  { href: "/taches", label: "Tâches", short: "Tâches", icon: "M5 7l2 2 4-4M5 15l2 2 4-4M14 8h6M14 16h6" },
  { href: "/cockpit", label: "Cockpit", short: "Cockpit", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm3.5 5.5-2 5-5 2 2-5z" },
  { href: "/reglages", label: "Réglages", short: "Réglages", icon: "M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function Wordmark({ demo }: { demo: boolean }) {
  return (
    <Link href="/" className="flex items-baseline gap-2">
      <span className="font-serif text-xl italic tracking-tight">Cockpit</span>
      {demo && (
        <span title="Données fictives, aucune connexion" className="smallcaps rounded-sm border border-warn/50 px-1 text-[11px] leading-4 text-warn">
          démo
        </span>
      )}
    </Link>
  );
}

function SearchButton({ className = "" }: { className?: string }) {
  return (
    <button
      onClick={openPalette}
      className={`flex items-center gap-2 rounded-md border border-rule px-2.5 py-1.5 text-sm text-ink-soft hover:border-rule-strong hover:text-ink ${className}`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <circle cx="11" cy="11" r="6" />
        <path d="m20 20-4.5-4.5" strokeLinecap="round" />
      </svg>
      <span className="flex-1 text-left">Rechercher</span>
      <kbd className="hidden font-mono text-[11px] text-ink-faint md:inline">Ctrl K</kbd>
    </button>
  );
}

export function Nav({ demo = false }: { demo?: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Desktop: a narrow column on the desk, beside the page. */}
      <nav className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col gap-6 px-5 py-8 md:flex">
        <Wordmark demo={demo} />
        <SearchButton />
        <ul className="flex flex-col gap-0.5">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                  isActive(l.href) ? "bg-paper text-ink shadow-[0_0_0_1px_var(--rule)]" : "text-ink-soft hover:text-ink"
                }`}
              >
                <Icon d={l.icon} />
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Mobile: a slim header… */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-rule bg-paper/95 py-2.5 backdrop-blur md:hidden"
        style={{ paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))", paddingTop: "max(10px, env(safe-area-inset-top))" }}
      >
        <Wordmark demo={demo} />
        <SearchButton className="max-w-40 flex-1" />
      </header>

      {/* …and a tab bar under the thumb. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-rule bg-paper/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive(l.href) ? "text-accent" : "text-ink-faint"}`}
          >
            <Icon d={l.icon} />
            {l.short}
          </Link>
        ))}
      </nav>
    </>
  );
}
