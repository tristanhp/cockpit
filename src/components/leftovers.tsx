"use client";

import { useTransition } from "react";
import { resolveLeftoverAction } from "@/app/actions";
import type { Leftover } from "@/rituals";
import { notify } from "./feedback";

const button = "rounded-md border border-rule-strong px-2.5 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50";

const CHOICES = [
  { key: "tomorrow", label: "Demain" },
  { key: "later", label: "Plus tard cette semaine" },
  { key: "drop", label: "Abandonner" },
] as const;

/** Everything waiting to be replaced, one tap each. Used by the clôture (Restes) and the morning catch-up. */
export function LeftoverList({ items, empty }: { items: Leftover[]; empty: string }) {
  const [pending, start] = useTransition();
  if (!items.length) return <p className="py-3 font-serif italic text-ink-faint">{empty}</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={`${item.kind}:${item.id}`} className="border-b border-rule py-3 last:border-b-0">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="min-w-0 flex-1">{item.title}</span>
            <span className="text-xs text-ink-faint">{item.meta}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {CHOICES.map((c) => (
              <button
                key={c.key}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await resolveLeftoverAction(item.kind, item.id, c.key);
                    notify(res.ok ? (c.key === "drop" ? "Abandonné." : "Replacé.") : res.error, res.ok ? "ok" : "error");
                  })
                }
                className={button}
              >
                {c.label}
              </button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
