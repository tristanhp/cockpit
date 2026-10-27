"use client";

import { useState, useTransition } from "react";
import { answerTypeRate, planBlock } from "@/app/actions";
import { notify } from "./feedback";

const chip = "rounded-md border border-rule-strong px-2.5 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50";

/** Task panel: "Planifier un bloc", by Cockpit or at a time of your choosing. */
export function PlanBlock({ taskId }: { taskId: string }) {
  const [pending, start] = useTransition();
  const [when, setWhen] = useState("");
  const run = (start_?: string) =>
    start(async () => {
      const res = await planBlock(taskId, start_);
      notify(res.ok ? "Bloc ajouté à l'agenda." : res.error, res.ok ? "ok" : "error");
    });
  return (
    <fieldset className="mt-5">
      <legend className="smallcaps mb-1.5 text-ink-faint">Planifier un bloc</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        <button disabled={pending} onClick={() => run()} className={chip}>Laisser Cockpit choisir</button>
        <input type="datetime-local" aria-label="Heure du bloc" value={when} onChange={(e) => setWhen(e.target.value)} className="rounded-md border border-rule-strong bg-paper px-2 py-1 text-xs focus:border-accent focus:outline-none" />
        <button disabled={pending || !when} onClick={() => run(when)} className={chip}>Poser ici</button>
      </div>
    </fieldset>
  );
}

/** Asked once per new task type, on the first block of that type. */
export function TypeQuestion({ name }: { name: string }) {
  const [pending, start] = useTransition();
  const [minutes, setMinutes] = useState("");
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-soft"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await answerTypeRate(name, Number(minutes));
          if (!res.ok) notify(res.error, "error");
        });
      }}
    >
      <label htmlFor="type-rate">Première fois pour « {name} » : combien de minutes par point d&apos;effort ?</label>
      <input id="type-rate" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="w-16 rounded-md border border-rule-strong bg-paper px-2 py-1 text-xs focus:border-accent focus:outline-none" />
      <button disabled={pending || !minutes} className={chip}>Enregistrer</button>
    </form>
  );
}
