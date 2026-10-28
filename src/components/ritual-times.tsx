"use client";

import { useTransition } from "react";
import { saveRitualTimes } from "@/app/actions";
import type { RitualSettings } from "@/rituals/settings";
import { notify } from "./feedback";

const input = "w-full min-w-0 rounded-md border border-rule-strong bg-paper px-2 py-1 text-sm font-mono focus:border-accent focus:outline-none";

const FIELDS: { name: keyof RitualSettings; label: string }[] = [
  { name: "capWeekday", label: "Cap en semaine" },
  { name: "capWeekend", label: "Cap le week-end" },
  { name: "clotureTime", label: "Clôture" },
  { name: "hardStop", label: "Arrêt des écrans" },
];

export function RitualTimes({ settings }: { settings: RitualSettings }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) =>
        start(async () => {
          const res = await saveRitualTimes(fd);
          notify(res.ok ? "Horaires enregistrés." : res.error, res.ok ? "ok" : "error");
        })
      }
      className="mt-3"
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {FIELDS.map((f) => (
          <label key={f.name} className="flex flex-col gap-1 text-xs text-ink-soft">
            {f.label}
            <input type="time" name={f.name} defaultValue={settings[f.name]} required className={input} />
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-faint">Les notifications du matin et du soir suivent ces heures.</p>
      <button disabled={pending} className="mt-3 rounded-md border border-rule-strong px-2.5 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50">
        Enregistrer
      </button>
    </form>
  );
}
