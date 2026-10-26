"use client";

import { useState, useTransition } from "react";
import { setProjectField, setTaskField, triageTask } from "@/app/actions";
import { EFFORTS, PRIORITY_LABEL } from "@/engine/priority";
import { addDays } from "@/lib/dates";
import { notify } from "./feedback";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());

const chip = (on: boolean) =>
  `rounded-md border px-2.5 py-1 text-xs transition-colors ${on ? "border-accent bg-accent/10 text-accent" : "border-rule-strong text-ink-soft hover:border-accent hover:text-accent"}`;

/** Optimistic value with rollback: shows the new value at once, restores it and reports if the write fails. */
function useRollback<T>(initial: T) {
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const commit = (next: T, write: () => Promise<{ ok: boolean; error?: string }>) => {
    const previous = value;
    setValue(next);
    start(async () => {
      const res = await write();
      if (!res.ok) {
        setValue(previous);
        notify(res.error ?? "Le changement a échoué", "error");
      }
    });
  };
  return { value, commit, pending };
}

export type TaskControlsProps = {
  taskId: string;
  done: boolean;
  priority: number;
  priorityAuto: boolean;
  effort: number | null;
  dueDate: string | null;
  triage: boolean;
};

export function TaskControls(p: TaskControlsProps) {
  const done = useRollback(p.done);
  const priority = useRollback(p.priority);
  const effort = useRollback(p.effort);
  const due = useRollback(p.dueDate);
  const [, start] = useTransition();
  const [triaged, setTriaged] = useState(false);
  const t = today();

  return (
    <div className="mt-2 grid gap-5" data-busy={done.pending || priority.pending || effort.pending || due.pending}>
      <button
        onClick={() => done.commit(!done.value, () => setTaskField(p.taskId, "done", !done.value))}
        className={`inline-flex w-fit items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${done.value ? "border-ok text-ok" : "border-rule-strong hover:border-accent hover:text-accent"}`}
      >
        <span aria-hidden>{done.value ? "✓" : "○"}</span>
        {done.value ? "Terminée · rouvrir" : "Marquer comme faite"}
        <kbd className="font-mono text-[11px] text-ink-faint">x</kbd>
      </button>

      <fieldset>
        <legend className="smallcaps mb-1.5 text-ink-faint">Priorité{p.priorityAuto && priority.value === p.priority ? " · automatique" : ""}</legend>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 0].map((n) => (
            <button key={n} aria-pressed={priority.value === n} onClick={() => priority.commit(n, () => setTaskField(p.taskId, "priority", n))} className={chip(priority.value === n)}>
              {PRIORITY_LABEL[n]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="smallcaps mb-1.5 text-ink-faint">Effort (points)</legend>
        <div className="flex flex-wrap gap-1.5">
          {EFFORTS.map((n) => (
            <button key={n} aria-pressed={effort.value === n} onClick={() => effort.commit(effort.value === n ? null : n, () => setTaskField(p.taskId, "effort", effort.value === n ? null : n))} className={chip(effort.value === n)}>
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="smallcaps mb-1.5 text-ink-faint">Échéance</legend>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="date"
            aria-label="Échéance"
            value={due.value ?? ""}
            onChange={(e) => due.commit(e.target.value || null, () => setTaskField(p.taskId, "dueDate", e.target.value || null))}
            className="rounded-md border border-rule-strong bg-paper px-2 py-1 text-xs focus:border-accent focus:outline-none"
          />
          <button onClick={() => due.commit(t, () => setTaskField(p.taskId, "dueDate", t))} className={chip(due.value === t)}>Aujourd&apos;hui</button>
          <button onClick={() => due.commit(addDays(t, 1), () => setTaskField(p.taskId, "dueDate", addDays(t, 1)))} className={chip(due.value === addDays(t, 1))}>Demain</button>
          {due.value && <button onClick={() => due.commit(null, () => setTaskField(p.taskId, "dueDate", null))} className="text-xs text-ink-faint hover:text-ink">Effacer</button>}
        </div>
      </fieldset>

      {p.triage && !triaged && (
        <fieldset>
          <legend className="smallcaps mb-1.5 text-ink-faint">Ce ticket Linear</legend>
          <div className="flex gap-1.5">
            <button
              className={chip(false)}
              onClick={() => start(async () => { const r = await triageTask(p.taskId, "mine"); if (r.ok) { setTriaged(true); notify("Gardé dans Mes tâches."); } else notify(r.error, "error"); })}
            >
              Me concerne
            </button>
            <button
              className={chip(false)}
              onClick={() => start(async () => { const r = await triageTask(p.taskId, "hidden"); if (r.ok) { setTriaged(true); notify("Retiré de À trier."); } else notify(r.error, "error"); })}
            >
              Pas pour moi
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}

export type ProjectControlsProps = {
  projectId: string;
  meteo: string | null;
  nextAction: string | null;
  nextDue: string | null;
  priority: number | null;
  status: "actif" | "en-attente";
  isProtected: boolean;
};

export function ProjectControls(p: ProjectControlsProps) {
  const meteo = useRollback(p.meteo);
  const priority = useRollback(p.priority);
  const status = useRollback(p.status);
  const due = useRollback(p.nextDue);
  const action = useRollback(p.nextAction ?? "");
  const [draft, setDraft] = useState(p.nextAction ?? "");

  return (
    <div className="mt-2 grid gap-5">
      <fieldset>
        <legend className="smallcaps mb-1.5 text-ink-faint">Météo</legend>
        <div className="flex gap-1.5">
          {[["🟢", "Sur les rails"], ["🟡", "À surveiller"], ["🔴", "En retard"]].map(([v, label]) => (
            <button key={v} aria-pressed={meteo.value === v} onClick={() => meteo.commit(v, () => setProjectField(p.projectId, "meteo", v))} className={chip(meteo.value === v)}>
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="grid gap-1.5">
        <span className="smallcaps text-ink-faint">Prochaine action</span>
        <input
          id="project-next-action"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== action.value && action.commit(draft, () => setProjectField(p.projectId, "nextAction", draft || null))}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="rounded-md border border-rule-strong bg-paper px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
        />
      </label>

      <label className="grid gap-1.5">
        <span className="smallcaps text-ink-faint">Prochaine échéance</span>
        <input
          id="project-next-due"
          type="date"
          value={due.value ?? ""}
          onChange={(e) => due.commit(e.target.value || null, () => setProjectField(p.projectId, "nextDue", e.target.value || null))}
          className="w-fit rounded-md border border-rule-strong bg-paper px-2 py-1 text-xs focus:border-accent focus:outline-none"
        />
      </label>

      <fieldset>
        <legend className="smallcaps mb-1.5 text-ink-faint">Priorité{p.isProtected && priority.value === p.priority ? " · protégé" : ""}</legend>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 0].map((n) => (
            <button key={n} aria-pressed={priority.value === n} onClick={() => priority.commit(n, () => setProjectField(p.projectId, "priority", n))} className={chip(priority.value === n)}>
              {PRIORITY_LABEL[n]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="smallcaps mb-1.5 text-ink-faint">Statut</legend>
        <div className="flex gap-1.5">
          {([["actif", "Actif"], ["en-attente", "En attente"]] as const).map(([v, label]) => (
            <button key={v} aria-pressed={status.value === v} onClick={() => status.commit(v, () => setProjectField(p.projectId, "status", v))} className={chip(status.value === v)}>
              {label}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
