import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Goal, Vision, Year } from "@/db/schema";
import {
  goalSignals, orphanTasks, progress, projectsWithoutGoal, seasonLimitError, seasonMarkdown, thread, visionMarkdown, SEASON_LIMIT,
  type GoalStatus, type Links, type Measure, type Progress, type Signal, type Thread, type World,
} from "@/engine/goals";
import { nowMs, parisDay } from "@/lib/dates";
import { needsTriage, openTasks, type TaskView } from "@/lib/queries";
import { fold } from "@/lib/text";
import { habitWeeks } from "@/rituals";
import { isDemo } from "@/sync";
import { createTask } from "@/writeback";

// Vision, year and season goals, and the thread that ties each one to today's work.
// The rules are pure and tested in `src/engine/goals.ts`; this file reads and writes the database.

const VISION_ID = "main";
export { SEASON_LIMIT };

export type GoalView = {
  goal: Goal;
  pillarName: string | null;
  parentTitle: string | null;
  links: Links;
  thread: Thread;
  progress: Progress;
  signals: Signal[];
};

export type GoalsOverview = {
  today: string;
  vision: Pick<Vision, "identity" | "horizon" | "rules">;
  year: Year | null;
  season: { id: string; name: string; startDate: string; endDate: string; notes: string | null } | null;
  yearGoals: GoalView[];
  seasonGoals: GoalView[];
  /** Everything a goal can be linked to, for the pickers. */
  world: { projects: { id: string; name: string }[]; milestones: { id: string; name: string }[]; habits: { id: string; name: string }[]; tasks: { id: string; title: string }[]; pillars: { id: string; name: string }[]; taskSources: { id: string; name: string }[] };
  orphans: TaskView[];
  withoutGoal: { id: string; name: string }[];
  exempt: { id: string; name: string }[];
  activeSeasonGoals: number;
};

const empty = (): Links => ({ projects: [], milestones: [], habits: [], tasks: [] });

export async function goalsOverview(now = nowMs()): Promise<GoalsOverview> {
  const today = parisDay(new Date(now));
  const [visionRow, years, seasons, goals, links, exemptions, projects, milestones, tasksAll, blocks, week, pillars, sources] = await Promise.all([
    db.query.vision.findFirst({ where: eq(schema.vision.id, VISION_ID) }),
    db.select().from(schema.years),
    db.select().from(schema.seasons),
    db.select().from(schema.goals),
    db.select().from(schema.goalLinks),
    db.select().from(schema.goalExemptions),
    db.select().from(schema.projects),
    db.select().from(schema.milestones),
    openTasks(),
    db.select().from(schema.blocks).where(ne(schema.blocks.status, "dropped")),
    habitWeeks(now),
    db.select().from(schema.pillars),
    db.select().from(schema.sources).where(eq(schema.sources.role, "tasks")),
  ]);
  const tasks = tasksAll.filter((t) => !needsTriage(t));
  const year = years.find((y) => y.startDate <= today && today <= y.endDate) ?? null;
  const season = seasons.find((s) => s.startDate <= today && today <= s.endDate) ?? null;

  const world: World = {
    projects: projects.map((p) => ({ id: p.id, name: p.name, nextAction: p.nextAction, nextDue: p.nextDue })),
    milestones: milestones.map((m) => ({ id: m.id, name: m.name, date: m.endDate ?? m.startDate })),
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, projectId: t.projectId, dueDate: t.dueDate })),
    blocks: blocks.map((b) => ({ id: b.id, title: b.title, taskId: b.taskId, start: b.start })),
    habits: week.habits.map((h) => ({ id: h.id, name: h.name })),
  };
  const linksOf = (goalId: string): Links => {
    const out = empty();
    for (const l of links.filter((x) => x.goalId === goalId)) out[({ project: "projects", milestone: "milestones", habit: "habits", task: "tasks" } as const)[l.kind]].push(l.refId);
    return out;
  };
  const view = (goal: Goal): GoalView => {
    const l = linksOf(goal.id);
    const th = thread(l, world);
    const habit = week.habits.find((h) => l.habits.includes(h.id));
    return {
      goal,
      pillarName: pillars.find((p) => p.id === goal.pillarId)?.name ?? null,
      parentTitle: goals.find((g) => g.id === goal.parentGoalId)?.title ?? null,
      links: l,
      thread: th,
      progress: progress(goal, { milestoneDates: th.milestones.map((m) => m.date), habitPct: habit?.pct ?? null, habitTarget: habit?.targetPct ?? null, today }),
      signals: goalSignals(goal, th, today),
    };
  };
  const order = (a: Goal, b: Goal) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "fr");
  const linked = new Set(links.filter((l) => l.kind === "project" && goals.some((g) => g.id === l.goalId && g.status !== "done")).map((l) => l.refId));
  const exempt = new Set(exemptions.map((e) => e.projectId));
  const nameOf = (id: string) => projects.find((p) => p.id === id)?.name ?? id;

  return {
    today,
    vision: { identity: visionRow?.identity ?? [], horizon: visionRow?.horizon ?? "", rules: visionRow?.rules ?? [] },
    year,
    season: season ? { id: season.id, name: season.name, startDate: season.startDate, endDate: season.endDate, notes: season.notes } : null,
    yearGoals: goals.filter((g) => g.horizon === "year" && (!year || g.yearId === year.id)).sort(order).map(view),
    seasonGoals: goals.filter((g) => g.horizon === "season" && season && g.seasonId === season.id).sort(order).map(view),
    world: {
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
      milestones: milestones.map((m) => ({ id: m.id, name: m.name })),
      habits: week.habits.map((h) => ({ id: h.id, name: h.name })),
      tasks: tasks.slice(0, 200).map((t) => ({ id: t.id, title: t.title })),
      pillars: pillars.map((p) => ({ id: p.id, name: p.name })),
      taskSources: sources.map((s) => ({ id: s.id, name: s.name })),
    },
    orphans: orphanTasks(tasks),
    withoutGoal: projectsWithoutGoal(projects, linked, exempt).map((p) => ({ id: p.id, name: p.name })),
    exempt: [...exempt].map((id) => ({ id, name: nameOf(id) })),
    activeSeasonGoals: season ? goals.filter((g) => g.horizon === "season" && g.seasonId === season.id && g.status === "active").length : 0,
  };
}

/** One goal with the overview it came from. Goals of another year or season are not shown, so they are not found here. */
export async function goalView(id: string, now = nowMs()): Promise<{ view: GoalView; overview: GoalsOverview } | null> {
  const overview = await goalsOverview(now);
  const view = [...overview.seasonGoals, ...overview.yearGoals].find((g) => g.goal.id === id);
  return view ? { view, overview } : null;
}

// ---- Writes --------------------------------------------------------------------------

export type VisionInput = { identity: string[]; horizon: string; rules: string[] };

const clean = (list: string[]) => list.map((s) => s.trim()).filter(Boolean);

export async function saveVision(input: VisionInput): Promise<void> {
  const row = { identity: clean(input.identity), horizon: input.horizon.trim(), rules: clean(input.rules), updatedAt: new Date().toISOString() };
  await db.insert(schema.vision).values({ id: VISION_ID, ...row }).onConflictDoUpdate({ target: schema.vision.id, set: row });
}

export type YearInput = { id?: string; theme: string; motto: string; startDate: string; endDate: string };
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function saveYear(input: YearInput): Promise<void> {
  if (!input.theme.trim()) throw new Error("Donne un thème à l'année");
  if (!isDay(input.startDate) || !isDay(input.endDate) || input.endDate < input.startDate) throw new Error("Dates de l'année invalides");
  const row = { theme: input.theme.trim(), motto: input.motto.trim() || null, startDate: input.startDate, endDate: input.endDate };
  const id = input.id || `year-${input.startDate.slice(0, 4)}`;
  await db.insert(schema.years).values({ id, ...row }).onConflictDoUpdate({ target: schema.years.id, set: row });
}

export type GoalInput = {
  id?: string;
  title: string;
  horizon: "year" | "season";
  yearId: string | null;
  seasonId: string | null;
  parentGoalId: string | null;
  pillarId: string | null;
  measure: Measure;
  target: number | null;
  current: number | null;
  unit: string;
  status: GoalStatus;
  dueDate: string | null;
  notes: string;
};

const MEASURES: Measure[] = ["milestones", "number", "habit", "boolean"];

export async function saveGoal(input: GoalInput): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new Error("Donne un titre à l'objectif");
  if (!MEASURES.includes(input.measure)) throw new Error("Mesure inconnue");
  if (input.measure === "number" && (!input.target || input.target <= 0)) throw new Error("Une mesure chiffrée a besoin d'une cible");
  if (input.dueDate && !isDay(input.dueDate)) throw new Error("Date invalide");
  if (input.horizon === "season" && !input.seasonId) throw new Error("Il n'y a pas de saison en cours : ajoute-en une dans la configuration");
  const all = await db.select().from(schema.goals);
  const refused = seasonLimitError(all, input, input.id);
  if (refused) throw new Error(refused);

  const row = {
    title, horizon: input.horizon, yearId: input.horizon === "year" ? input.yearId : null, seasonId: input.horizon === "season" ? input.seasonId : null,
    parentGoalId: input.parentGoalId || null, pillarId: input.pillarId || null, measure: input.measure,
    target: input.measure === "number" ? input.target : null, current: input.measure === "number" ? (input.current ?? 0) : null,
    unit: input.unit.trim() || null, status: input.status, dueDate: input.dueDate || null, notes: input.notes.trim() || null,
  };
  if (input.id) {
    await db.update(schema.goals).set(row).where(eq(schema.goals.id, input.id));
    return input.id;
  }
  const id = `goal-${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(schema.goals).values({ id, ...row, sortOrder: all.length });
  return id;
}

export async function setGoalStatus(id: string, status: GoalStatus): Promise<void> {
  const [goal, all] = await Promise.all([db.query.goals.findFirst({ where: eq(schema.goals.id, id) }), db.select().from(schema.goals)]);
  if (!goal) throw new Error("Objectif introuvable");
  const refused = seasonLimitError(all, { horizon: goal.horizon, seasonId: goal.seasonId, status }, id);
  if (refused) throw new Error(refused);
  await db.update(schema.goals).set({ status }).where(eq(schema.goals.id, id));
}

export async function setGoalProgress(id: string, current: number): Promise<void> {
  if (!Number.isFinite(current) || current < 0) throw new Error("Valeur invalide");
  await db.update(schema.goals).set({ current }).where(and(eq(schema.goals.id, id), eq(schema.goals.measure, "number")));
}

export type LinkKind = "project" | "milestone" | "habit" | "task";

export async function linkGoal(goalId: string, kind: LinkKind, refId: string): Promise<void> {
  if (!refId) throw new Error("Choisis quelque chose à lier");
  await db.insert(schema.goalLinks).values({ goalId, kind, refId }).onConflictDoNothing();
  if (kind === "project") await db.delete(schema.goalExemptions).where(eq(schema.goalExemptions.projectId, refId));
}

export async function unlinkGoal(goalId: string, kind: LinkKind, refId: string): Promise<void> {
  await db.delete(schema.goalLinks).where(and(eq(schema.goalLinks.goalId, goalId), eq(schema.goalLinks.kind, kind), eq(schema.goalLinks.refId, refId)));
}

export async function setProjectExempt(projectId: string, exempt: boolean): Promise<void> {
  if (exempt) await db.insert(schema.goalExemptions).values({ projectId }).onConflictDoNothing();
  else await db.delete(schema.goalExemptions).where(eq(schema.goalExemptions.projectId, projectId));
}

/**
 * A milestone created from a goal. No source exposes milestone creation, so it is Cockpit-only data
 * (source "cockpit"), which a sync never replaces, and it is linked to the goal at once.
 */
export async function addGoalMilestone(goalId: string, name: string, date: string): Promise<void> {
  if (!name.trim()) throw new Error("Donne un nom au jalon");
  if (!isDay(date)) throw new Error("Date invalide");
  const id = `cockpit:${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(schema.milestones).values({ id, sourceId: "cockpit", externalId: id, name: name.trim(), startDate: date, endDate: null, type: "Objectif", approximate: false, notes: null, syncedAt: new Date().toISOString() });
  await linkGoal(goalId, "milestone", id);
}

/** A task created through the S2 write path (Notion or Linear) and linked to the goal. */
export async function addGoalTask(goalId: string, input: { title: string; dueDate: string | null; sourceId: string; projectId: string | null }, opts: { via?: string } = {}): Promise<void> {
  if (!input.title.trim()) throw new Error("Donne un titre à la tâche");
  if (input.dueDate && !isDay(input.dueDate)) throw new Error("Date invalide");
  const created = await createTask(input.sourceId, input.projectId, { title: input.title.trim(), dueDate: input.dueDate }, opts);
  await linkGoal(goalId, "task", created.id);
}

// ---- Markdown export ------------------------------------------------------------------

export type ExportResult = { written: string[] } | { skipped: string };

/** One file for the vision and one per season, into VAULT_GOALS_PATH. Never written in demo mode. */
export async function exportGoals(now = nowMs()): Promise<ExportResult> {
  const dir = process.env.VAULT_GOALS_PATH;
  if (!dir) return { skipped: "VAULT_GOALS_PATH n'est pas défini" };
  if (isDemo()) return { skipped: "désactivé en mode démo" };
  const [overview, seasons, goals, pillars] = await Promise.all([
    goalsOverview(now),
    db.select().from(schema.seasons),
    db.select().from(schema.goals),
    db.select().from(schema.pillars),
  ]);
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  const put = async (file: string, text: string) => {
    await writeFile(path.join(dir, file), text);
    written.push(file);
  };
  await put("vision.md", visionMarkdown(overview.vision, overview.year));
  const seasonIds = new Set(goals.filter((g) => g.horizon === "season").map((g) => g.seasonId));
  for (const s of seasons.filter((x) => seasonIds.has(x.id) || x.id === overview.season?.id)) {
    const ofSeason = goals.filter((g) => g.horizon === "season" && g.seasonId === s.id);
    const views = s.id === overview.season?.id ? overview.seasonGoals : [];
    const docs = ofSeason.map((g) => {
      const v = views.find((x) => x.goal.id === g.id);
      return {
        title: g.title, status: g.status, progress: v?.progress ?? { pct: 0, label: "—" }, pillar: pillars.find((p) => p.id === g.pillarId)?.name ?? null,
        dueDate: g.dueDate, notes: g.notes, parent: goals.find((x) => x.id === g.parentGoalId)?.title ?? null,
      };
    });
    await put(`saison-${fold(s.name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || s.id}.md`, seasonMarkdown(s, docs));
  }
  return { written };
}

/** After an edit: refresh the vault files, never failing the edit itself. */
export async function exportQuietly(): Promise<void> {
  try {
    await exportGoals();
  } catch {
    // The edit is saved; the button in Réglages reports a failing export.
  }
}
