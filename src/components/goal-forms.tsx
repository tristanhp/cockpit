"use client";

import { useState, useTransition } from "react";
import {
  addGoalMilestoneAction, addGoalTaskAction, linkGoalAction, saveGoalAction, saveVisionAction, saveYearAction, setGoalProgressAction, setGoalStatusAction, setProjectExemptAction, unlinkGoalAction,
} from "@/app/actions";
import type { GoalStatus, Measure } from "@/engine/goals";
import { notify } from "./feedback";

const field = "w-full rounded-md border border-rule-strong bg-paper px-3 py-2 text-sm placeholder:text-ink-faint focus:border-accent focus:outline-none";
const small = "rounded-md border border-rule-strong bg-paper px-2 py-1 text-xs focus:border-accent focus:outline-none";
const chip = "rounded-md border border-rule-strong px-2.5 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50";
const primary = "rounded-md bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50";
const label = "flex flex-col gap-1 text-xs text-ink-soft";

type Result = { ok: true } | { ok: false; error: string };

/** Runs a write, then toasts the outcome. */
function useWrite() {
  const [pending, start] = useTransition();
  const write = (fn: () => Promise<Result>, done: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      notify(res.ok ? done : res.error, res.ok ? "ok" : "error");
      if (res.ok) after?.();
    });
  return { pending, write };
}

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

// ---- Vision and year ------------------------------------------------------------------

export function VisionEditor({ identity, horizon, rules }: { identity: string[]; horizon: string; rules: string[] }) {
  const [editing, setEditing] = useState(false);
  const [id, setId] = useState(identity.join("\n"));
  const [hz, setHz] = useState(horizon);
  const [rl, setRl] = useState(rules.join("\n"));
  const { pending, write } = useWrite();

  if (!editing)
    return (
      <div>
        {identity.length === 0 && !horizon && rules.length === 0 ? (
          <p className="py-2 font-serif italic text-ink-faint">Rien d&apos;écrit pour l&apos;instant : qui veux-tu être, où veux-tu être dans cinq ans ?</p>
        ) : (
          <div className="grid gap-x-10 gap-y-4 md:grid-cols-2">
            <div>
              <p className="smallcaps mb-1 text-xs text-ink-faint">Identité</p>
              <ul className="font-serif text-lg italic leading-snug">{identity.map((i) => <li key={i}>{i}</li>)}</ul>
              <p className="smallcaps mb-1 mt-4 text-xs text-ink-faint">Règles du système</p>
              <ul className="text-sm text-ink-soft">{rules.map((r) => <li key={r} className="py-0.5">· {r}</li>)}</ul>
            </div>
            <div>
              <p className="smallcaps mb-1 text-xs text-ink-faint">Dans 3 à 5 ans</p>
              <p className="whitespace-pre-line text-sm leading-relaxed">{horizon || "—"}</p>
            </div>
          </div>
        )}
        <button onClick={() => setEditing(true)} className={`${chip} mt-3`}>Modifier la vision</button>
      </div>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        write(() => saveVisionAction({ identity: lines(id), horizon: hz, rules: lines(rl) }), "Vision enregistrée.", () => setEditing(false));
      }}
      className="grid gap-4 md:grid-cols-2"
    >
      <label className={label}>Identité (une phrase par ligne)<textarea value={id} onChange={(e) => setId(e.target.value)} rows={4} className={field} /></label>
      <label className={label}>Dans 3 à 5 ans<textarea value={hz} onChange={(e) => setHz(e.target.value)} rows={4} className={field} /></label>
      <label className={`${label} md:col-span-2`}>Règles du système (une par ligne)<textarea value={rl} onChange={(e) => setRl(e.target.value)} rows={3} className={field} /></label>
      <div className="flex gap-2 md:col-span-2">
        <button disabled={pending} className={primary}>Enregistrer</button>
        <button type="button" onClick={() => setEditing(false)} className="text-sm text-ink-soft hover:text-ink">Annuler</button>
      </div>
    </form>
  );
}

export function YearEditor({ year, suggestStart, suggestEnd }: { year: { id: string; theme: string; motto: string | null; startDate: string; endDate: string } | null; suggestStart: string; suggestEnd: string }) {
  const [editing, setEditing] = useState(false);
  const { pending, write } = useWrite();
  if (!editing)
    return (
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {year ? (
          <>
            <span className="font-serif text-2xl italic">{year.theme}</span>
            {year.motto && <span className="text-sm text-ink-soft">« {year.motto} »</span>}
          </>
        ) : (
          <span className="font-serif italic text-ink-faint">Pas d&apos;année en cours.</span>
        )}
        <button onClick={() => setEditing(true)} className={chip}>{year ? "Modifier" : "Définir l'année"}</button>
      </div>
    );
  return (
    <form
      action={(fd) =>
        write(
          () => saveYearAction({ id: year?.id, theme: String(fd.get("theme")), motto: String(fd.get("motto")), startDate: String(fd.get("start")), endDate: String(fd.get("end")) }),
          "Année enregistrée.",
          () => setEditing(false),
        )
      }
      className="grid gap-3 sm:grid-cols-2"
    >
      <label className={label}>Thème<input name="theme" defaultValue={year?.theme} required className={field} /></label>
      <label className={label}>Devise<input name="motto" defaultValue={year?.motto ?? ""} className={field} /></label>
      <label className={label}>Début<input type="date" name="start" defaultValue={year?.startDate ?? suggestStart} required className={field} /></label>
      <label className={label}>Fin<input type="date" name="end" defaultValue={year?.endDate ?? suggestEnd} required className={field} /></label>
      <div className="flex gap-2 sm:col-span-2">
        <button disabled={pending} className={primary}>Enregistrer</button>
        <button type="button" onClick={() => setEditing(false)} className="text-sm text-ink-soft hover:text-ink">Annuler</button>
      </div>
    </form>
  );
}

// ---- A goal ---------------------------------------------------------------------------------

export type GoalFormProps = {
  goal?: { id: string; title: string; horizon: "year" | "season"; measure: Measure; target: number | null; current: number | null; unit: string | null; status: GoalStatus; dueDate: string | null; notes: string | null; pillarId: string | null; parentGoalId: string | null };
  yearId: string | null;
  seasonId: string | null;
  pillars: { id: string; name: string }[];
  yearGoals: { id: string; title: string }[];
  canAddSeason: boolean;
  onDone?: () => void;
};

export function GoalForm({ goal, yearId, seasonId, pillars, yearGoals, canAddSeason, onDone }: GoalFormProps) {
  const { pending, write } = useWrite();
  const [measure, setMeasure] = useState<Measure>(goal?.measure ?? "boolean");
  const [horizon, setHorizon] = useState<"year" | "season">(goal?.horizon ?? (seasonId ? "season" : "year"));
  return (
    <form
      action={(fd) => {
        const num = (k: string) => (String(fd.get(k) ?? "") === "" ? null : Number(fd.get(k)));
        write(
          () =>
            saveGoalAction({
              id: goal?.id, title: String(fd.get("title")), horizon, yearId, seasonId, parentGoalId: String(fd.get("parent") ?? "") || null, pillarId: String(fd.get("pillar") ?? "") || null,
              measure, target: num("target"), current: num("current"), unit: String(fd.get("unit") ?? ""), status: goal?.status ?? "active", dueDate: String(fd.get("due") ?? "") || null, notes: String(fd.get("notes") ?? ""),
            }),
          goal ? "Objectif modifié." : "Objectif créé.",
          onDone,
        );
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <label className={`${label} sm:col-span-2`}>Titre<input name="title" defaultValue={goal?.title} required className={field} /></label>
      <label className={label}>
        Horizon
        <select value={horizon} onChange={(e) => setHorizon(e.target.value as "year" | "season")} disabled={Boolean(goal)} className={field}>
          <option value="season" disabled={!seasonId}>Saison{seasonId ? "" : " (aucune en cours)"}</option>
          <option value="year">Année</option>
        </select>
      </label>
      <label className={label}>
        Mesure
        <select value={measure} onChange={(e) => setMeasure(e.target.value as Measure)} className={field}>
          <option value="boolean">Fait / pas fait</option>
          <option value="milestones">Jalons atteints</option>
          <option value="number">Un nombre</option>
          <option value="habit">Une habitude</option>
        </select>
      </label>
      {measure === "number" && (
        <>
          <label className={label}>Cible<input name="target" type="number" step="any" min="0" defaultValue={goal?.target ?? ""} required className={field} /></label>
          <label className={label}>Actuel<input name="current" type="number" step="any" min="0" defaultValue={goal?.current ?? 0} className={field} /></label>
          <label className={label}>Unité<input name="unit" defaultValue={goal?.unit ?? ""} placeholder="km, candidatures…" className={field} /></label>
        </>
      )}
      <label className={label}>
        Pilier
        <select name="pillar" defaultValue={goal?.pillarId ?? ""} className={field}>
          <option value="">Aucun</option>
          {pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {horizon === "season" && yearGoals.length > 0 && (
        <label className={label}>
          Au service de
          <select name="parent" defaultValue={goal?.parentGoalId ?? ""} className={field}>
            <option value="">Aucun objectif annuel</option>
            {yearGoals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </label>
      )}
      <label className={label}>Échéance<input name="due" type="date" defaultValue={goal?.dueDate ?? ""} className={field} /></label>
      <label className={`${label} sm:col-span-2`}>Notes<textarea name="notes" defaultValue={goal?.notes ?? ""} rows={2} className={field} /></label>
      {horizon === "season" && !goal && !canAddSeason && <p className="text-xs text-warn sm:col-span-2">Cette saison a déjà 3 objectifs actifs : l&apos;objectif sera refusé tant que tu n&apos;en as pas mis un en pause.</p>}
      <div className="sm:col-span-2"><button disabled={pending} className={primary}>{goal ? "Enregistrer" : "Créer l'objectif"}</button></div>
    </form>
  );
}

/** "Nouvel objectif", collapsed until needed. */
export function NewGoal(props: Omit<GoalFormProps, "goal" | "onDone">) {
  const [open, setOpen] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className={chip}>Nouvel objectif</button>;
  return (
    <div className="mt-2 rounded-md border border-rule-strong p-4">
      <GoalForm {...props} onDone={() => setOpen(false)} />
      <button onClick={() => setOpen(false)} className="mt-3 text-sm text-ink-soft hover:text-ink">Annuler</button>
    </div>
  );
}

// ---- The goal panel -----------------------------------------------------------------------

export function GoalControls({ form, status, measure, current, unit, seasonLimitNote }: { form: GoalFormProps; status: GoalStatus; measure: Measure; current: number | null; unit: string | null; seasonLimitNote: boolean }) {
  const { pending, write } = useWrite();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(current ?? 0));
  const id = form.goal!.id;
  const setStatus = (next: GoalStatus, done: string) => write(() => setGoalStatusAction(id, next), done);
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-1.5">
        {status === "active" ? (
          <button disabled={pending} onClick={() => setStatus("paused", "Objectif en pause.")} className={chip}>Mettre en pause</button>
        ) : (
          <button disabled={pending} onClick={() => setStatus("active", "Objectif repris.")} className={chip}>{status === "done" ? "Rouvrir" : "Reprendre"}</button>
        )}
        {status !== "done" && <button disabled={pending} onClick={() => setStatus("done", "Objectif atteint.")} className={chip}>Marquer atteint</button>}
        <button onClick={() => setEditing((e) => !e)} className={chip}>{editing ? "Fermer" : "Modifier"}</button>
      </div>
      {seasonLimitNote && status !== "active" && <p className="mt-2 text-xs text-ink-faint">La saison a 3 objectifs actifs : mets-en un en pause pour reprendre celui-ci.</p>}
      {measure === "number" && (
        <form onSubmit={(e) => { e.preventDefault(); write(() => setGoalProgressAction(id, Number(value)), "Progression enregistrée."); }} className="mt-3 flex items-center gap-2 text-sm">
          <label htmlFor="goal-current" className="text-ink-soft">Actuel{unit ? ` (${unit})` : ""}</label>
          <input id="goal-current" type="number" step="any" min="0" value={value} onChange={(e) => setValue(e.target.value)} className={`${small} w-24`} />
          <button disabled={pending} className={chip}>Mettre à jour</button>
        </form>
      )}
      {editing && <div className="mt-4 rounded-md border border-rule-strong p-4"><GoalForm {...form} onDone={() => setEditing(false)} /></div>}
    </div>
  );
}

export function Unlink({ goalId, kind, refId, name }: { goalId: string; kind: "project" | "milestone" | "habit" | "task"; refId: string; name: string }) {
  const { pending, write } = useWrite();
  return (
    <button disabled={pending} aria-label={`Délier ${name}`} title="Délier" onClick={() => write(() => unlinkGoalAction(goalId, kind, refId), "Délié.")} className="px-1 text-ink-faint hover:text-margin disabled:opacity-50">×</button>
  );
}

const KIND_LABEL = { project: "Projet", milestone: "Jalon", habit: "Habitude", task: "Tâche" } as const;

export function LinkPicker({ goalId, options }: { goalId: string; options: Record<"project" | "milestone" | "habit" | "task", { id: string; name: string }[]> }) {
  const { pending, write } = useWrite();
  const [kind, setKind] = useState<keyof typeof options>("project");
  const [ref, setRef] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); write(() => linkGoalAction(goalId, kind, ref), "Lié.", () => setRef("")); }} className="flex flex-wrap items-center gap-1.5">
      <select aria-label="Type" value={kind} onChange={(e) => { setKind(e.target.value as keyof typeof options); setRef(""); }} className={small}>
        {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
      </select>
      <select aria-label="Élément à lier" value={ref} onChange={(e) => setRef(e.target.value)} className={`${small} min-w-0 max-w-56 flex-1`}>
        <option value="">Choisir…</option>
        {options[kind].map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <button disabled={pending || !ref} className={chip}>Lier</button>
    </form>
  );
}

export function AddMilestone({ goalId }: { goalId: string }) {
  const { pending, write } = useWrite();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); write(() => addGoalMilestoneAction(goalId, name, date), "Jalon ajouté.", () => { setName(""); setDate(""); }); }} className="flex flex-wrap items-center gap-1.5">
      <input aria-label="Nom du jalon" placeholder="Nouveau jalon" value={name} onChange={(e) => setName(e.target.value)} className={`${small} min-w-0 flex-1`} />
      <input aria-label="Date du jalon" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={small} />
      <button disabled={pending || !name.trim() || !date} className={chip}>Ajouter un jalon</button>
    </form>
  );
}

export function AddTask({ goalId, sources, projects }: { goalId: string; sources: { id: string; name: string }[]; projects: { id: string; name: string }[] }) {
  const { pending, write } = useWrite();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [source, setSource] = useState(sources[0]?.id ?? "");
  const [project, setProject] = useState("");
  if (!sources.length) return <p className="text-xs text-ink-faint">Aucune source de tâches configurée.</p>;
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); write(() => addGoalTaskAction(goalId, { title, dueDate: due || null, sourceId: source, projectId: project || null }), "Tâche créée et liée.", () => { setTitle(""); setDue(""); }); }}
      className="flex flex-wrap items-center gap-1.5"
    >
      <input aria-label="Titre de la tâche" placeholder="Nouvelle tâche" value={title} onChange={(e) => setTitle(e.target.value)} className={`${small} min-w-0 flex-1`} />
      <input aria-label="Échéance" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={small} />
      <select aria-label="Où la créer" value={source} onChange={(e) => setSource(e.target.value)} className={small}>
        {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select aria-label="Projet" value={project} onChange={(e) => setProject(e.target.value)} className={`${small} max-w-40`}>
        <option value="">Sans projet</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button disabled={pending || !title.trim()} className={chip}>Ajouter une tâche</button>
    </form>
  );
}

/** "Découper avec Claude": copies a ready-made prompt for a Claude chat. No model is called from the app. */
export function BreakdownButton({ prompt }: { prompt: string }) {
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(prompt);
          notify("Prompt copié : colle-le dans une conversation avec Claude.");
        } catch {
          notify("Copie impossible : sélectionne le texte ci-dessous.", "error");
        }
      }}
      className={chip}
    >
      Découper avec Claude
    </button>
  );
}

/** Projets tab: a priority project can be served by a goal, or be "hors objectifs" on purpose. */
export function ExemptButton({ projectId, exempt }: { projectId: string; exempt: boolean }) {
  const { pending, write } = useWrite();
  return (
    <button disabled={pending} onClick={() => write(() => setProjectExemptAction(projectId, !exempt), exempt ? "De nouveau sans exemption." : "Marqué hors objectifs.")} className={chip}>
      {exempt ? "Retirer « hors objectifs »" : "Hors objectifs"}
    </button>
  );
}
