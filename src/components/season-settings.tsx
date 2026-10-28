"use client";

import { useTransition } from "react";
import { saveSeasonSettingsAction } from "@/app/actions";
import type { SeasonSettings } from "@/engine/season";
import { notify } from "./feedback";

const input = "w-full min-w-0 rounded-md border border-rule-strong bg-paper px-2 py-1 text-sm font-mono focus:border-accent focus:outline-none";

export function SeasonSettingsForm({ settings }: { settings: SeasonSettings }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) =>
        start(async () => {
          const res = await saveSeasonSettingsAction(fd);
          notify(res.ok ? "Réglages de la saison enregistrés." : res.error, res.ok ? "ok" : "error");
        })
      }
      className="mt-3"
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <label className="flex flex-col gap-1 text-xs text-ink-soft">Victoire à partir de (%)<input type="number" name="winAt" min={1} max={100} defaultValue={Math.round(settings.winAt * 100)} required className={input} /></label>
        <label className="flex flex-col gap-1 text-xs text-ink-soft">Match nul à partir de (%)<input type="number" name="drawAt" min={1} max={99} defaultValue={Math.round(settings.drawAt * 100)} required className={input} /></label>
        <label className="col-span-2 flex flex-col gap-1 text-xs text-ink-soft">Jalons qui font un match de coupe (séparés par des virgules)<input name="cupTypes" defaultValue={settings.cupTypes.join(", ")} placeholder="Évaluation, Soutenance" className={`${input} font-sans`} /></label>
        <label className="col-span-2 flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" name="showDaily" defaultChecked={settings.showDaily} className="size-4 accent-[var(--accent)]" />
          Montrer le résultat du jour à la clôture (sinon, tout est révélé le dimanche)
        </label>
      </div>
      <p className="mt-2 text-xs text-ink-faint">Le jour d&apos;une évaluation est toujours un match de coupe : les buts comptent double.</p>
      <button disabled={pending} className="mt-3 rounded-md border border-rule-strong px-2.5 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50">Enregistrer</button>
    </form>
  );
}
