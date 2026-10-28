"use client";

import { useState, useTransition } from "react";
import { adjustPlanAction, dismissCatchUpAction, fileEverything, startDayAction } from "@/app/actions";
import type { Leftover } from "@/rituals";
import { notify } from "./feedback";
import { LeftoverList } from "./leftovers";

const primary = "rounded-md bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50";
const ghost = "rounded-md border border-rule-strong px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-50";

/** C'est parti and Ajuster: reorder the three priorities and swap the première action. */
export function CapActions({ top3, firstId, pool }: { top3: { id: string; title: string }[]; firstId: string | null; pool: { id: string; title: string }[] }) {
  const [pending, start] = useTransition();
  const [adjusting, setAdjusting] = useState(false);
  const [order, setOrder] = useState(top3.map((t) => t.id));
  const [first, setFirst] = useState(firstId);
  const title = (id: string) => pool.find((p) => p.id === id)?.title ?? top3.find((t) => t.id === id)?.title ?? id;
  const move = (i: number, d: -1 | 1) => setOrder((o) => o.map((x, k) => (k === i + d ? o[i] : k === i ? o[i + d] : x)));

  return (
    <div className="mt-5">
      {adjusting && (
        <div className="mb-4 rounded-md border border-rule-strong p-3">
          <ul>
            {order.map((id, i) => (
              <li key={id} className="flex items-center gap-2 py-1 text-sm">
                <span className="font-mono text-xs text-ink-faint">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{title(id)}</span>
                <button aria-label="Monter" disabled={i === 0} onClick={() => move(i, -1)} className="px-1.5 text-ink-soft hover:text-accent disabled:opacity-30">↑</button>
                <button aria-label="Descendre" disabled={i === order.length - 1} onClick={() => move(i, 1)} className="px-1.5 text-ink-soft hover:text-accent disabled:opacity-30">↓</button>
              </li>
            ))}
          </ul>
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            Première action
            <select value={first ?? ""} onChange={(e) => setFirst(e.target.value || null)} className="min-w-0 rounded-md border border-rule-strong bg-paper px-2 py-1 text-sm">
              {order.map((id) => (
                <option key={id} value={id}>{title(id)}</option>
              ))}
            </select>
          </label>
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await adjustPlanAction(order, first && order.includes(first) ? first : (order[0] ?? null));
                notify(res.ok ? "Plan ajusté." : res.error, res.ok ? "ok" : "error");
                if (res.ok) setAdjusting(false);
              })
            }
            className={`${ghost} mt-3`}
          >
            Enregistrer
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await startDayAction();
              notify(res.ok ? (res.message ?? "C'est parti.") : res.error, res.ok ? "ok" : "error");
            })
          }
          className={primary}
        >
          C&apos;est parti
        </button>
        {top3.length > 0 && (
          <button disabled={pending} onClick={() => setAdjusting((a) => !a)} className={ghost}>
            Ajuster
          </button>
        )}
      </div>
    </div>
  );
}

/** The one-minute catch-up after a skipped clôture. */
export function CatchUp({ leftovers, inbox }: { leftovers: Leftover[]; inbox: number }) {
  const [pending, start] = useTransition();
  return (
    <section aria-label="Rattrapage" className="mb-8 border-l-2 border-margin pl-4">
      <h2 className="font-serif text-xl italic">Hier soir, la clôture a sauté</h2>
      <p className="mb-1 text-sm text-ink-soft">Une minute pour remettre les compteurs à zéro, puis tu continues.</p>
      <LeftoverList items={leftovers} empty="Rien à replacer." />
      {inbox > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-soft">
          {inbox} capture{inbox > 1 ? "s" : ""} en attente.
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await fileEverything();
                notify(res.ok ? `${res.filed} rangée${(res.filed ?? 0) > 1 ? "s" : ""}.` : res.error, res.ok ? "ok" : "error");
              })
            }
            className={ghost}
          >
            Tout ranger
          </button>
        </p>
      )}
      <button disabled={pending} onClick={() => start(async () => void (await dismissCatchUpAction()))} className={`${primary} mt-4`}>
        Continuer
      </button>
    </section>
  );
}
