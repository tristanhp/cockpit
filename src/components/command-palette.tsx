"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchEverything, syncNow, type SearchHit } from "@/app/actions";
import { fold as norm } from "@/lib/text";
import { openCapture } from "./capture-dialog";

const OPEN_EVENT = "cockpit:palette";
export const openPalette = () => window.dispatchEvent(new Event(OPEN_EVENT));

type Item = { id: string; label: string; hint?: string; group: string; run: () => void | Promise<unknown> };


export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on open, here rather than in an effect, so the palette never renders stale results.
  const show = () => {
    setQuery("");
    setHits([]);
    setActive(0);
    setOpen(true);
    requestAnimationFrame(() => input.current?.focus());
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) setOpen(false);
        else show();
      }
    };
    // "#rechercher" opens the palette, so a bookmark or phone shortcut can land straight in search.
    const onHash = () => {
      if (window.location.hash === "#rechercher") {
        history.replaceState(null, "", window.location.pathname + window.location.search);
        show();
      }
    };
    const initial = setTimeout(onHash, 0);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, show);
    window.addEventListener("hashchange", onHash);
    return () => {
      clearTimeout(initial);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, show);
      window.removeEventListener("hashchange", onHash);
    };
  }, [open]);

  const onQuery = (value: string) => {
    setQuery(value);
    setActive(0);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) return setHits([]);
    timer.current = setTimeout(() => start(async () => setHits(await searchEverything(value))), 120);
  };

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => router.push(href);
    const commands: Item[] = [
      { id: "nav-today", group: "Aller à", label: "Aujourd'hui", run: go("/") },
      { id: "nav-tasks", group: "Aller à", label: "Tâches", run: go("/taches") },
      { id: "nav-tasks-due", group: "Aller à", label: "Tâches par échéance", run: go("/taches?par=echeance") },
      { id: "nav-triage", group: "Aller à", label: "Linear à trier", run: go("/taches?trier=1") },
      { id: "nav-inbox", group: "Aller à", label: "Inbox", hint: "captures à ranger", run: go("/inbox") },
      { id: "nav-week", group: "Aller à", label: "Semaine", hint: "blocs par jour", run: go("/semaine") },
      { id: "act-cloture", group: "Actions", label: "Faire la clôture", hint: "bilan, restes, demain", run: go("/cloture") },
      { id: "nav-habits", group: "Aller à", label: "Habitudes", hint: "la semaine en cours", run: go("/habitudes") },
      { id: "act-revue", group: "Actions", label: "Faire la revue", hint: "la semaine, en dix minutes", run: go("/revue") },
      { id: "act-replan", group: "Actions", label: "Replanifier ma journée", hint: "r", run: go("/?replan=1") },
      { id: "nav-goals", group: "Aller à", label: "Objectifs", hint: "vision, année, saison", run: go("/objectifs") },
      { id: "nav-projects", group: "Aller à", label: "Projets", hint: "par priorité", run: go("/objectifs?vue=projets") },
      { id: "nav-settings", group: "Aller à", label: "Réglages", run: go("/reglages") },
      { id: "act-capture", group: "Actions", label: "Capturer", hint: "c", run: () => setTimeout(openCapture, 0) },
      { id: "nav-journal", group: "Aller à", label: "Journal des changements", hint: "annuler un changement", run: go("/reglages#journal") },
      { id: "act-sync", group: "Actions", label: "Synchroniser maintenant", hint: "toutes les sources", run: () => syncNow() },
    ];
    const q = norm(query.trim());
    const filtered = q ? commands.filter((c) => norm(c.label).includes(q)) : commands;
    return [
      ...filtered,
      ...hits.map((h) => ({ id: h.id, group: h.kind === "task" ? "Tâches" : "Projets", label: h.label, hint: h.hint, run: go(h.href) })),
    ];
  }, [query, hits, router]);

  const run = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    start(async () => {
      await item.run();
    });
  };

  if (!open) return null;

  let lastGroup = "";
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-start justify-center bg-scrim px-4 pt-[12vh] backdrop-blur-md" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-label="Palette de commandes"
        className="w-full max-w-xl overflow-hidden rounded-lg border border-rule-strong bg-paper shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={input}
          id="palette-query"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") return setOpen(false);
            if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, items.length - 1));
            else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
            else if (e.key === "Enter") run(items[active]);
            else return;
            e.preventDefault();
          }}
          placeholder="Aller à, chercher une tâche ou un projet…"
          className="w-full border-b border-rule bg-transparent px-4 py-3.5 font-serif text-lg outline-none placeholder:text-ink-faint"
        />
        <ul className="max-h-[50vh] overflow-y-auto py-2" role="listbox">
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id}>
                {header && <div className="smallcaps px-4 pb-1 pt-2 text-xs text-ink-faint">{header}</div>}
                <button
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(item)}
                  className={`flex w-full items-baseline gap-3 px-4 py-2 text-left text-sm ${i === active ? "bg-paper-2 text-ink" : "text-ink-soft"}`}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="shrink-0 truncate text-xs text-ink-faint">{item.hint}</span>}
                </button>
              </li>
            );
          })}
          {!items.length && (
            <li className="px-4 py-6 text-center text-sm text-ink-faint">{pending ? "Recherche…" : "Rien ne correspond."}</li>
          )}
        </ul>
        <div className="flex gap-4 border-t border-rule px-4 py-2 font-mono text-[11px] text-ink-faint">
          <span>↑↓ naviguer</span>
          <span>↵ ouvrir</span>
          <span>Échap fermer</span>
        </div>
      </div>
    </div>
  );
}
