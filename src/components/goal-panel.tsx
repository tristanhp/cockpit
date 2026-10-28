import Link from "next/link";
import { breakdownPrompt, measureLabel, SIGNAL_LABEL, type Signal } from "@/engine/goals";
import { formatDayCompact, formatDayLong, formatTime } from "@/lib/dates";
import { goalView, SEASON_LIMIT } from "@/goals";
import { proposalsForGoal } from "@/proposals";
import { AddMilestone, AddTask, BreakdownButton, GoalControls, LinkPicker, Unlink } from "./goal-forms";
import { Fact, Facts, Shell } from "./panel-shell";

export const SIGNAL_TONE: Record<Signal, string> = { "sans-fil": "border-warn text-warn", "a-larret": "border-margin text-margin", "sur-le-fil": "border-ok text-ok" };
const SIGNAL_HINT: Record<Signal, string> = {
  "sans-fil": "Rien de prévu dans les 14 prochains jours.",
  "a-larret": "Un projet lié n'a pas de prochaine action, ou elle a plus d'une semaine de retard.",
  "sur-le-fil": "Du travail cette semaine, rien d'arrêté.",
};

export function SignalChip({ signal }: { signal: Signal }) {
  return <span title={SIGNAL_HINT[signal]} className={`smallcaps whitespace-nowrap rounded-sm border px-1.5 text-[11px] leading-4 ${SIGNAL_TONE[signal]}`}>{SIGNAL_LABEL[signal]}</span>;
}

const link = "underline decoration-rule-strong underline-offset-4 hover:decoration-accent";

/** The goal side panel (`?g=`): its thread as a vertical timeline, signals, and the ways to build it. */
export async function GoalPanel({ id, close, rest }: { id: string; close: string; path: string; rest: URLSearchParams }) {
  const found = await goalView(id);
  if (!found) return <Shell close={close} title="Objectif introuvable"><p className="text-sm text-ink-soft">Il n&apos;appartient pas à l&apos;année ou à la saison en cours.</p></Shell>;
  const { view, overview } = found;
  const { goal, thread: th } = view;
  const seasonFull = overview.activeSeasonGoals >= SEASON_LIMIT;
  const withParam = (base: string, extra: Record<string, string>) => `${base}?${new URLSearchParams({ ...Object.fromEntries(rest), ...extra })}`;
  const projectHref = (pid: string) => withParam("/objectifs", { vue: "projets", p: pid });

  const pendingProposals = await proposalsForGoal(goal.id);
  const prompt = view.signals.includes("sans-fil")
    ? breakdownPrompt(goal, { goalId: goal.id, seasonName: overview.season?.name ?? null, dueDate: goal.dueDate, projects: th.projects.map((p) => p.name), notes: goal.notes, today: overview.today })
    : null;

  return (
    <Shell close={close} eyebrow={goal.horizon === "year" ? "Objectif de l'année" : "Objectif de saison"} title={goal.title}>
      <div className="flex flex-wrap items-center gap-2">
        {view.signals.map((s) => <SignalChip key={s} signal={s} />)}
        {goal.status !== "active" && <span className="smallcaps text-xs text-ink-faint">{goal.status === "paused" ? "en pause" : "atteint"}</span>}
      </div>

      <Facts>
        <Fact label="Progression">
          <span className="flex items-center gap-3">
            <span className="h-1.5 w-28 overflow-hidden rounded-full bg-rule"><span className="block h-full bg-accent" style={{ width: `${view.progress.pct}%` }} /></span>
            <span className="font-mono text-xs tabular-nums">{view.progress.pct} % · {view.progress.label}</span>
          </span>
        </Fact>
        <Fact label="Mesure">{measureLabel(goal.measure)}</Fact>
        <Fact label="Pilier"><span className="inline-flex items-center gap-2">{view.pillarName ?? "Sans pilier"}</span></Fact>
        {goal.dueDate && <Fact label="Échéance">{formatDayLong(goal.dueDate)}</Fact>}
        {view.parentTitle && <Fact label="Au service de">{view.parentTitle}</Fact>}
        {goal.notes && <Fact label="Notes">{goal.notes}</Fact>}
      </Facts>

      <GoalControls
        key={`${goal.id}:${goal.status}:${goal.current}:${goal.title}`}
        form={{ goal: { ...goal }, yearId: goal.yearId, seasonId: goal.seasonId, pillars: overview.world.pillars, yearGoals: overview.yearGoals.filter((y) => y.goal.id !== goal.id).map((y) => ({ id: y.goal.id, title: y.goal.title })), canAddSeason: !seasonFull }}
        status={goal.status}
        measure={goal.measure}
        current={goal.current}
        unit={goal.unit}
        seasonLimitNote={goal.horizon === "season" && seasonFull}
      />

      <h3 className="mb-2 mt-8 border-b border-ink/80 pb-1 font-serif text-lg italic">Le fil</h3>
      <ol className="relative ml-1 border-l border-rule-strong">
        {th.projects.map((p) => (
          <li key={p.id} className="relative pb-4 pl-5">
            <span className="absolute -left-[5px] top-1.5 size-[9px] rounded-full border-2 border-accent bg-paper" />
            <span className="flex items-baseline gap-2">
              <Link href={projectHref(p.id)} scroll={false} className={`min-w-0 flex-1 truncate ${link}`}>{p.name}</Link>
              <Unlink goalId={goal.id} kind="project" refId={p.id} name={p.name} />
            </span>
            <span className="block text-xs text-ink-faint">
              {p.nextAction ? <>→ {p.nextAction}{p.nextDue ? ` · ${formatDayCompact(p.nextDue)}` : ""}</> : <span className="text-margin">aucune prochaine action</span>}
            </span>
            {p.tasks.length > 0 && (
              <ul className="mt-1.5 text-sm">
                {p.tasks.map((t) => (
                  <li key={t.id} className="flex items-baseline gap-2 py-0.5">
                    <Link href={`/taches?t=${encodeURIComponent(t.id)}`} className={`min-w-0 flex-1 truncate ${link}`}>{t.title}</Link>
                    <span className="font-mono text-xs text-ink-faint">{t.dueDate ? formatDayCompact(t.dueDate) : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {th.milestones.map((m) => (
          <li key={m.id} className="relative pb-4 pl-5">
            <span className="absolute -left-[5px] top-1.5 size-[9px] rounded-full border-2 border-margin bg-paper" />
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              <span className="font-mono text-xs text-ink-faint">{m.date ? formatDayCompact(m.date) : ""}</span>
              <Unlink goalId={goal.id} kind="milestone" refId={m.id} name={m.name} />
            </span>
            <span className="smallcaps text-xs text-ink-faint">jalon</span>
          </li>
        ))}
        {th.looseTasks.map((t) => (
          <li key={t.id} className="relative pb-4 pl-5">
            <span className="absolute -left-[5px] top-1.5 size-[9px] rounded-full border-2 border-ink-faint bg-paper" />
            <span className="flex items-baseline gap-2">
              <Link href={`/taches?t=${encodeURIComponent(t.id)}`} className={`min-w-0 flex-1 truncate ${link}`}>{t.title}</Link>
              <span className="font-mono text-xs text-ink-faint">{t.dueDate ? formatDayCompact(t.dueDate) : ""}</span>
              <Unlink goalId={goal.id} kind="task" refId={t.id} name={t.title} />
            </span>
          </li>
        ))}
        {th.habits.map((h) => (
          <li key={h.id} className="relative pb-4 pl-5">
            <span className="absolute -left-[5px] top-1.5 size-[9px] rounded-full border-2 border-ok bg-paper" />
            <span className="flex items-baseline gap-2">
              <Link href="/habitudes" className={`min-w-0 flex-1 truncate ${link}`}>{h.name}</Link>
              <Unlink goalId={goal.id} kind="habit" refId={h.id} name={h.name} />
            </span>
            <span className="smallcaps text-xs text-ink-faint">habitude</span>
          </li>
        ))}
        {th.blocks.length > 0 && (
          <li className="relative pl-5">
            <span className="absolute -left-[5px] top-1.5 size-[9px] rounded-full border-2 border-rule-strong bg-paper" />
            <span className="smallcaps text-xs text-ink-faint">blocs prévus</span>
            <ul className="text-sm">
              {th.blocks.slice(0, 6).map((b) => (
                <li key={b.id} className="flex items-baseline gap-2 py-0.5">
                  <span className="min-w-0 flex-1 truncate">{b.title}</span>
                  <span className="font-mono text-xs text-ink-faint">{formatDayCompact(b.start.slice(0, 10))} · {formatTime(b.start)}</span>
                </li>
              ))}
            </ul>
          </li>
        )}
      </ol>
      {th.projects.length + th.milestones.length + th.looseTasks.length + th.habits.length === 0 && <p className="py-2 font-serif italic text-ink-faint">Aucun fil : rien n&apos;est encore lié à cet objectif.</p>}

      <h3 className="mb-2 mt-8 border-b border-ink/80 pb-1 font-serif text-lg italic">Construire le fil</h3>
      <div className="grid gap-3">
        <LinkPicker
          goalId={goal.id}
          options={{
            project: overview.world.projects,
            milestone: overview.world.milestones,
            habit: overview.world.habits,
            task: overview.world.tasks.map((t) => ({ id: t.id, name: t.title })),
          }}
        />
        <AddMilestone goalId={goal.id} />
        <AddTask goalId={goal.id} sources={overview.world.taskSources} projects={th.projects.length ? th.projects.map((p) => ({ id: p.id, name: p.name })) : overview.world.projects} />
      </div>

      {(prompt || pendingProposals.length > 0) && (
        <div className="mt-6">
          {prompt && (
            <>
              <p className="mb-1.5 text-xs text-ink-faint">Cet objectif est sans fil. Copie ce prompt dans une conversation avec Claude (connecté à Cockpit, il te fera une proposition à valider), ou ajoute des jalons et des tâches à la main ci-dessus.</p>
              <BreakdownButton prompt={prompt} />
            </>
          )}
          {pendingProposals.length > 0 && (
            <p className="mt-3 text-sm">
              {pendingProposals.length} proposition{pendingProposals.length > 1 ? "s" : ""} de découpage en attente :{" "}
              <Link href="/propositions" className="underline decoration-rule-strong underline-offset-4 hover:decoration-accent">les voir</Link>
            </p>
          )}
        </div>
      )}
    </Shell>
  );
}

