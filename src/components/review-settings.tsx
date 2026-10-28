"use client";

import { useTransition } from "react";
import { saveReviewSettingsAction } from "@/app/actions";
import type { ReviewSettings } from "@/review";
import { notify } from "./feedback";

const input = "w-full min-w-0 rounded-md border border-rule-strong bg-paper px-2 py-1 text-sm focus:border-accent focus:outline-none";
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export function ReviewSettingsForm({ settings }: { settings: ReviewSettings }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) =>
        start(async () => {
          const res = await saveReviewSettingsAction(fd);
          notify(res.ok ? "Réglages de la revue enregistrés." : res.error, res.ok ? "ok" : "error");
        })
      }
      className="mt-3"
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <label className="flex flex-col gap-1 text-xs text-ink-soft">
          Jour
          <select name="day" defaultValue={settings.day} className={input}>
            {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-soft">Heure<input type="time" name="time" defaultValue={settings.time} required className={`${input} font-mono`} /></label>
        <label className="flex flex-col gap-1 text-xs text-ink-soft">
          Budget minimum (points)
          <input type="number" name="minBudget" min={1} max={100} defaultValue={settings.minBudget} required className={`${input} font-mono`} />
        </label>
      </div>
      <p className="mt-2 text-xs text-ink-faint">Le budget de la semaine est le plus grand du minimum et de la vitesse (médiane des quatre dernières semaines).</p>
      <button disabled={pending} className="mt-3 rounded-md border border-rule-strong px-2.5 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50">Enregistrer</button>
    </form>
  );
}
