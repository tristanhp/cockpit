import Link from "next/link";
import { loadContext, needsTriage, openTasks, taskById } from "@/lib/queries";
import { PRIORITY_LABEL } from "@/engine/priority";
import { formatDayLong, parisDay } from "@/lib/dates";
import { DueLabel, PillarDot, PriorityBars, SourceTag, TaskList } from "./ui";
import { ProjectControls, TaskControls } from "./task-controls";
import { PlanBlock } from "./plan-block";
import { Fact, Facts, Shell, SourceButton } from "./panel-shell";
import { GoalPanel } from "./goal-panel";

type SP = Record<string, string | string[] | undefined>;

/** Renders the side panel when the URL carries `?t=<task id>` or `?p=<project id>`. */
export async function DetailPanel({ sp, path }: { sp: SP; path: string }) {
  const t = typeof sp.t === "string" ? sp.t : null;
  const p = typeof sp.p === "string" ? sp.p : null;
  const g = typeof sp.g === "string" ? sp.g : null;
  if (!t && !p && !g) return null;

  const rest = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (k === "t" || k === "p" || k === "g" || typeof v !== "string" ? [] : [[k, v]])));
  const close = rest.size ? `${path}?${rest}` : path;
  if (g) return <GoalPanel id={g} close={close} path={path} rest={rest} />;
  const today = parisDay();
  const [tasks, ctx, one] = await Promise.all([openTasks(), loadContext(), t ? taskById(t) : null]);

  if (t) {
    const task = one;
    if (!task) return <Shell close={close} title="Tâche introuvable"><p className="text-sm text-ink-soft">Elle a peut-être été terminée ou supprimée depuis la dernière synchronisation.</p></Shell>;
    const sourceName = { notion: "Notion", linear: "Linear", gcal: "Google Agenda" }[task.source.kind];
    return (
      <Shell close={close} eyebrow={task.identifier ?? "Tâche"} title={task.title} task={{ id: task.id, done: task.status === "done" }}>
        <TaskControls
          key={`${task.id}:${task.status}:${task.priority}:${task.effort}:${task.dueDate}`}
          taskId={task.id}
          done={task.status === "done"}
          priority={task.priority ?? 0}
          priorityAuto={task.priorityAuto}
          effort={task.effort}
          dueDate={task.dueDate}
          triage={needsTriage(task)}
        />
        {task.status !== "done" && <PlanBlock taskId={task.id} />}
        <Facts>
          <Fact label="Échéance">{task.dueDate ? <>{formatDayLong(task.dueDate)} · <DueLabel due={task.dueDate} today={today} /></> : "Aucune"}</Fact>
          <Fact label="Statut">{task.statusRaw ?? task.status}</Fact>
          <Fact label="Projet">
            {task.project ? (
              <Link href={`${path}?${new URLSearchParams({ ...Object.fromEntries(rest), p: task.project.id })}`} scroll={false} className="underline decoration-rule-strong underline-offset-4 hover:decoration-accent">
                {task.project.name}
              </Link>
            ) : "Aucun"}
          </Fact>
          <Fact label="Pilier"><span className="inline-flex items-center gap-2"><PillarDot pillar={task.pillar} />{task.pillar?.name ?? "Sans pilier"}</span></Fact>
          {task.source.kind === "linear" && <Fact label="Assignée à">{task.assignedToMe ? "toi" : (task.assigneeName ?? "personne")}</Fact>}
          <Fact label="Source">{task.source.name} · <SourceTag source={task.source} /></Fact>
        </Facts>
        {task.url && <SourceButton href={task.url}>Ouvrir dans {sourceName}</SourceButton>}
      </Shell>
    );
  }

  const project = ctx.projects.find((x) => x.id === p);
  if (!project) return <Shell close={close} title="Projet introuvable"><p className="text-sm text-ink-soft">Il n&apos;existe plus dans la base Projets.</p></Shell>;
  const pillar = ctx.pillars.find((x) => x.id === project.pillarId) ?? null;
  const projectTasks = tasks.filter((x) => x.projectId === project.id);
  return (
    <Shell close={close} eyebrow={project.protected ? "Habitude protégée" : project.status === "en-attente" ? "Projet en attente" : "Projet"} title={project.name}>
      <ProjectControls
        key={`${project.id}:${project.meteo}:${project.nextAction}:${project.nextDue}:${project.priority}:${project.status}`}
        projectId={project.id}
        meteo={project.meteo}
        nextAction={project.nextAction}
        nextDue={project.nextDue}
        priority={project.priority}
        status={project.status}
        isProtected={project.protected}
      />
      <Facts>
        <Fact label="Priorité">{project.protected ? "Protégé · hors échelle" : <span className="inline-flex items-center gap-2"><PriorityBars priority={project.priority} />{PRIORITY_LABEL[project.priority ?? 0]}</span>}</Fact>
        <Fact label="Pilier"><span className="inline-flex items-center gap-2"><PillarDot pillar={pillar} />{pillar?.name ?? "Sans pilier"}</span></Fact>
        {project.notes && <Fact label="Notes">{project.notes}</Fact>}
      </Facts>
      {project.url && <SourceButton href={project.url}>Ouvrir dans Notion</SourceButton>}
      <h3 className="mb-1 mt-8 border-b border-ink/80 pb-1 font-serif text-lg italic">
        Tâches ouvertes <span className="ml-1 font-mono text-xs not-italic text-ink-faint">{projectTasks.length}</span>
      </h3>
      <TaskList tasks={projectTasks} today={today} empty="Aucune tâche ouverte rattachée à ce projet." />
    </Shell>
  );
}

