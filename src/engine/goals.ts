import { addDays } from "@/lib/dates";

// Pure rules of the goals layer: progress per measure, the thread down to today's work, the
// signals, the per-season limit and the exports. Reading and writing the database lives in `src/goals`.

export const SEASON_LIMIT = 3;

export type Measure = "milestones" | "number" | "habit" | "boolean";
export type GoalStatus = "active" | "paused" | "done";

export type GoalLite = {
  id: string;
  title: string;
  horizon: "year" | "season";
  seasonId: string | null;
  measure: Measure;
  target: number | null;
  current: number | null;
  unit: string | null;
  status: GoalStatus;
};

// ---- The limit ------------------------------------------------------------------

/** At most three active goals per season. `excludeId` is the goal being edited. */
export function seasonLimitError(goals: Pick<GoalLite, "id" | "horizon" | "seasonId" | "status">[], goal: { horizon: "year" | "season"; seasonId: string | null; status: GoalStatus }, excludeId?: string): string | null {
  if (goal.horizon !== "season" || goal.status !== "active" || !goal.seasonId) return null;
  const active = goals.filter((g) => g.horizon === "season" && g.seasonId === goal.seasonId && g.status === "active" && g.id !== excludeId).length;
  return active >= SEASON_LIMIT ? `Cette saison a déjà ${SEASON_LIMIT} objectifs actifs. Mets-en un en pause pour en ajouter un autre.` : null;
}

// ---- Progress ---------------------------------------------------------------------

export type ProgressContext = {
  /** Date of each linked milestone (end, else start). A milestone counts as reached once its day has passed. */
  milestoneDates: (string | null)[];
  /** This week's percentage of the linked habit and its target; null with no habit linked. */
  habitPct: number | null;
  habitTarget: number | null;
  today: string;
};

export type Progress = { pct: number; label: string };

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function progress(goal: Pick<GoalLite, "measure" | "target" | "current" | "unit" | "status">, ctx: ProgressContext): Progress {
  switch (goal.measure) {
    case "milestones": {
      const total = ctx.milestoneDates.length;
      if (!total) return { pct: 0, label: "aucun jalon" };
      const reached = ctx.milestoneDates.filter((d) => d !== null && d <= ctx.today).length;
      return { pct: clamp((reached / total) * 100), label: `${reached} / ${total} jalon${total > 1 ? "s" : ""}` };
    }
    case "number": {
      const current = goal.current ?? 0;
      const unit = goal.unit ? ` ${goal.unit}` : "";
      if (!goal.target || goal.target <= 0) return { pct: 0, label: `${current}${unit}` };
      return { pct: clamp((current / goal.target) * 100), label: `${current} / ${goal.target}${unit}` };
    }
    case "habit": {
      if (ctx.habitPct === null) return { pct: 0, label: "aucune habitude liée" };
      const target = ctx.habitTarget ?? 80;
      return { pct: clamp((ctx.habitPct / target) * 100), label: `${ctx.habitPct} % / ${target} %` };
    }
    case "boolean":
      return goal.status === "done" ? { pct: 100, label: "fait" } : { pct: 0, label: "à faire" };
  }
}

// ---- The thread ---------------------------------------------------------------------

export type ThreadProject = { id: string; name: string; nextAction: string | null; nextDue: string | null };
export type ThreadTask = { id: string; title: string; projectId: string | null; dueDate: string | null };
export type ThreadMilestone = { id: string; name: string; date: string | null };
export type ThreadBlock = { id: string; title: string; taskId: string | null; start: string };
export type ThreadHabit = { id: string; name: string };

export type Links = { projects: string[]; milestones: string[]; habits: string[]; tasks: string[] };

export type World = {
  projects: ThreadProject[];
  milestones: ThreadMilestone[];
  /** Open tasks only. */
  tasks: ThreadTask[];
  blocks: ThreadBlock[];
  habits: ThreadHabit[];
};

export type Thread = {
  projects: (ThreadProject & { tasks: ThreadTask[] })[];
  milestones: ThreadMilestone[];
  habits: ThreadHabit[];
  /** Linked tasks that belong to none of the linked projects. */
  looseTasks: ThreadTask[];
  blocks: ThreadBlock[];
};

/** goal → projects → milestones → tasks → blocks, following the links and project membership. */
export function thread(links: Links, world: World): Thread {
  const projects = world.projects.filter((p) => links.projects.includes(p.id)).map((p) => ({ ...p, tasks: world.tasks.filter((t) => t.projectId === p.id) }));
  const inProjects = new Set(projects.flatMap((p) => p.tasks.map((t) => t.id)));
  const looseTasks = world.tasks.filter((t) => links.tasks.includes(t.id) && !inProjects.has(t.id));
  const taskIds = new Set([...inProjects, ...looseTasks.map((t) => t.id)]);
  return {
    projects,
    milestones: world.milestones.filter((m) => links.milestones.includes(m.id)),
    habits: world.habits.filter((h) => links.habits.includes(h.id)),
    looseTasks,
    blocks: world.blocks.filter((b) => b.taskId && taskIds.has(b.taskId)),
  };
}

export const threadTasks = (th: Thread): ThreadTask[] => [...th.projects.flatMap((p) => p.tasks), ...th.looseTasks];

// ---- Signals -------------------------------------------------------------------------

export type Signal = "sans-fil" | "a-larret" | "sur-le-fil";

export const SIGNAL_LABEL: Record<Signal, string> = { "sans-fil": "sans fil", "a-larret": "à l'arrêt", "sur-le-fil": "sur le fil" };

/** No next action, or a next action more than a week overdue. */
export function projectStalled(p: Pick<ThreadProject, "nextAction" | "nextDue">, today: string): boolean {
  if (!p.nextAction?.trim()) return true;
  return p.nextDue !== null && p.nextDue < addDays(today, -7);
}

const WORK_WINDOW_DAYS = 14;

/**
 * Only active goals have signals. *Sans fil*: nothing planned in the next 14 days (no open task due by then,
 * no block, no habit). *À l'arrêt*: a linked project is stalled. *Sur le fil*: work this week and nothing stalled.
 * Milestones are never "late": one counts as reached once its day has passed.
 */
export function goalSignals(goal: Pick<GoalLite, "status">, th: Thread, today: string): Signal[] {
  if (goal.status !== "active") return [];
  const tasks = threadTasks(th);
  const within = (days: number) => {
    const limit = addDays(today, days);
    return tasks.some((t) => t.dueDate !== null && t.dueDate <= limit) || th.blocks.some((b) => b.start.slice(0, 10) >= today && b.start.slice(0, 10) <= limit);
  };
  const signals: Signal[] = [];
  const noWork = !within(WORK_WINDOW_DAYS) && th.habits.length === 0;
  const stalled = th.projects.some((p) => projectStalled(p, today));
  if (noWork) signals.push("sans-fil");
  if (stalled) signals.push("a-larret");
  if (!noWork && !stalled && (within(7) || th.habits.length > 0)) signals.push("sur-le-fil");
  return signals;
}

export const needsAttention = (signals: Signal[]) => signals.includes("sans-fil") || signals.includes("a-larret");

/** Tasks that belong to no project. */
export const orphanTasks = <T extends { projectId: string | null }>(tasks: T[]): T[] => tasks.filter((t) => !t.projectId);

/** Priority projects (Urgent or Haute) that serve no goal and were not marked "hors objectifs". */
export function projectsWithoutGoal<P extends { id: string; status: string; protected: boolean; priority: number | null }>(projects: P[], linked: Set<string>, exempt: Set<string>): P[] {
  return projects.filter((p) => p.status === "actif" && !p.protected && (p.priority === 1 || p.priority === 2) && !linked.has(p.id) && !exempt.has(p.id));
}

// ---- Prompt and exports -----------------------------------------------------------------

const MEASURE_LABEL: Record<Measure, string> = { milestones: "jalons atteints", number: "un nombre à atteindre", habit: "une habitude (pourcentage hebdomadaire)", boolean: "fait ou pas fait" };
export const measureLabel = (m: Measure) => MEASURE_LABEL[m];

/** A ready-made prompt to break a *sans fil* goal down in a Claude chat. */
export function breakdownPrompt(goal: Pick<GoalLite, "title" | "measure" | "target" | "unit" | "current">, ctx: { goalId: string; seasonName: string | null; dueDate: string | null; projects: string[]; notes: string | null; today: string }): string {
  const lines = [
    "Aide-moi à découper un objectif en travail concret.",
    "",
    `Objectif : ${goal.title}`,
    `Mesure : ${MEASURE_LABEL[goal.measure]}${goal.target ? ` (cible ${goal.target}${goal.unit ? ` ${goal.unit}` : ""}, actuellement ${goal.current ?? 0})` : ""}`,
    ctx.seasonName ? `Saison : ${ctx.seasonName}` : null,
    ctx.dueDate ? `Échéance : ${ctx.dueDate}` : null,
    ctx.projects.length ? `Projets déjà liés : ${ctx.projects.join(", ")}` : "Aucun projet lié pour l'instant.",
    ctx.notes ? `Notes : ${ctx.notes}` : null,
    `Aujourd'hui : ${ctx.today}`,
    "",
    "Contexte : cet objectif n'a aucun travail prévu dans les 14 prochains jours (« sans fil »).",
    "À produire : 3 à 6 jalons datés, puis pour le premier jalon 3 à 5 tâches de moins de deux heures chacune, avec un effort estimé (1, 2, 3, 5 ou 8 points).",
    `Si tu as accès à Cockpit (serveur MCP) : lis l'objectif avec list_goals, puis appelle propose_goal_breakdown avec goalId « ${ctx.goalId} ». Je validerai la proposition dans Cockpit (Propositions) ; tu ne changes rien toi-même.`,
    "Sinon, réponds en liste, sans introduction.",
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

export type VisionDoc = { identity: string[]; horizon: string; rules: string[] };
export type YearDoc = { theme: string; motto: string | null; startDate: string; endDate: string };
export type GoalDoc = { title: string; status: GoalStatus; progress: Progress; pillar: string | null; dueDate: string | null; notes: string | null; parent: string | null };

const bullets = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "_(rien d'écrit)_");

export function visionMarkdown(v: VisionDoc, year: YearDoc | null): string {
  return [
    "# Vision",
    year ? `\n## ${year.theme} (${year.startDate} → ${year.endDate})${year.motto ? `\n\n> ${year.motto}` : ""}` : "",
    "\n## Identité\n\n" + bullets(v.identity),
    "\n## Horizon 3 à 5 ans\n\n" + (v.horizon.trim() || "_(rien d'écrit)_"),
    "\n## Règles du système\n\n" + bullets(v.rules),
    "",
  ].join("\n");
}

const STATUS_LABEL: Record<GoalStatus, string> = { active: "actif", paused: "en pause", done: "atteint" };

export function seasonMarkdown(season: { name: string; startDate: string; endDate: string }, goals: GoalDoc[]): string {
  const body = goals.map((g) =>
    [`## ${g.title}`, "", `- Statut : ${STATUS_LABEL[g.status]}`, `- Progression : ${g.progress.pct} % (${g.progress.label})`, g.pillar ? `- Pilier : ${g.pillar}` : null, g.parent ? `- Au service de : ${g.parent}` : null, g.dueDate ? `- Échéance : ${g.dueDate}` : null, g.notes ? `\n${g.notes}` : null, ""]
      .filter((l): l is string => l !== null)
      .join("\n"),
  );
  return [`# ${season.name}`, "", `${season.startDate} → ${season.endDate}`, "", ...(body.length ? body : ["_(aucun objectif)_", ""])].join("\n");
}
