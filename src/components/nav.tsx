"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { openCapture } from "./capture-dialog";
import { openPalette } from "./command-palette";

const LINKS = [
  { href: "/", label: "Aujourd'hui", short: "Jour", icon: "M4 6h16M4 12h10M4 18h7" },
  { href: "/taches", label: "Tâches", short: "Tâches", icon: "M5 7l2 2 4-4M5 15l2 2 4-4M14 8h6M14 16h6" },
  { href: "/cockpit", label: "Cockpit", short: "Cockpit", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm3.5 5.5-2 5-5 2 2-5z" },
  { href: "/reglages", label: "Réglages", short: "Réglages", icon: "M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4" },
];

// Behind "Plus" on the phone. Objectifs joins this tab bar when its route exists (S6).
const MORE = [
  { href: "/cockpit", label: "Cockpit", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm3.5 5.5-2 5-5 2 2-5z" },
  { href: "/semaine", label: "Semaine", icon: "M4 6h16M4 12h16M4 18h16M9 4v4M15 10v4M8 16v4" },
  { href: "/inbox", label: "Inbox", icon: "M4 13l2-7h12l2 7M4 13v5h16v-5M4 13h4l1 2h6l1-2h4" },
  { href: "/reglages", label: "Réglages", icon: "M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4" },
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
  const [more, setMore] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Desktop: a narrow column on the desk, beside the page. */}
      <nav className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col gap-6 px-5 py-8 md:flex">
        <Wordmark demo={demo} />
        <SearchButton />
        <button onClick={openCapture} className="flex items-center gap-2 rounded-md border border-rule px-2.5 py-1.5 text-sm text-ink-soft hover:border-rule-strong hover:text-ink">
          <Icon d="M12 5v14M5 12h14" />
          <span className="flex-1 text-left">Capturer</span>
          <kbd className="font-mono text-[11px] text-ink-faint">c</kbd>
        </button>
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

      {/* …and a tab bar under the thumb: Jour, Tâches, +, Plus. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-rule bg-paper/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {LINKS.slice(0, 2).map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive(l.href) ? "text-accent" : "text-ink-faint"}`}
          >
            <Icon d={l.icon} />
            {l.short}
          </Link>
        ))}
        <button onClick={openCapture} aria-label="Capturer" className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-accent">
          <Icon d="M12 5v14M5 12h14" />
          Capturer
        </button>
        <button
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${MORE.some((l) => isActive(l.href)) || more ? "text-accent" : "text-ink-faint"}`}
        >
          <Icon d="M5 12h.01M12 12h.01M19 12h.01" />
          Plus
        </button>
      </nav>

      {more && (
        <div className="fixed inset-0 z-30 md:hidden" onClick={() => setMore(false)}>
          <div className="fade-in absolute inset-0 bg-scrim backdrop-blur-md" />
          <ul
            className="drawer-in absolute inset-x-3 rounded-lg border border-rule-strong bg-paper p-2 shadow-2xl"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 64px)" }}
          >
            {MORE.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={`flex items-center gap-3 rounded-md px-3 py-3 text-sm ${isActive(l.href) ? "text-accent" : "text-ink"}`}>
                  <Icon d={l.icon} />
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
