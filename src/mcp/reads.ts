import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PRIORITY_LABEL, parsePriorityName } from "@/engine/priority";
import { addDays, formatTime, isoWeekday, nowMs, parisDay, weekdayName } from "@/lib/dates";
import { goalsOverview } from "@/goals";
import { loadContext, needsTriage, openTasks, pendingInbox, taskById, type TaskView } from "@/lib/queries";
import { searchAll } from "@/lib/search";
import { fold } from "@/lib/text";
import { blocksBetween, missedBlocks, nowAndNext, type BlockView } from "@/planning";
import { listProposals } from "@/proposals";
import { habitWeeks } from "@/rituals";
import { reviewView, weekStartOf } from "@/review";
import { SIGNAL_LABEL } from "@/engine/goals";

// What the MCP server reads: compact JSON with ids and links, nothing that is not already on a screen.
// Times are Paris local ("2026-11-04 14:00"). `cockpit` is a path inside the app; `url` is the task's own page at its source.

export const appLink = (path: string) => (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, "")}${path}` : path);
const local = (iso: string) => `${parisDay(iso)} ${formatTime(iso)}`;

const taskOut = (t: TaskView, today: string) => ({
  id: t.id,
  title: t.title,
  identifier: t.identifier,
  status: t.status,
  priority: PRIORITY_LABEL[t.priority ?? 0],
  effort: t.effort,
  due: t.dueDate,
  late: Boolean(t.dueDate && t.dueDate < today),
  project: t.project?.name ?? null,
  projectId: t.projectId,
  source: t.source.name,
  sourceId: t.sourceId,
  url: t.url,
  cockpit: appLink(`/taches?t=${encodeURIComponent(t.id)}`),
});

const blockOut = (b: BlockView) => ({ id: b.id, title: b.title, start: local(b.start), end: local(b.end), status: b.status, taskId: b.taskId, effort: b.effort });

export async function getToday(now = nowMs()) {
  const today = parisDay(new Date(now));
  const [tasks, blocks, strip, missed, inbox, plan] = await Promise.all([
    openTasks(),
    blocksBetween(today, today),
    nowAndNext(now),
    missedBlocks(),
    pendingInbox(),
    db.query.dayPlans.findFirst({ where: eq(schema.dayPlans.day, today) }),
  ]);
  const mine = tasks.filter((t) => !needsTriage(t));
  return {
    day: today,
    weekday: weekdayName(today),
    now: { current: strip.current ? blockOut(strip.current) : null, next: strip.next ? blockOut(strip.next) : null, minutesLeft: strip.minutesLeft },
    blocks: blocks.map(blockOut),
    urgent: mine.filter((t) => t.dueDate && t.dueDate <= addDays(today, 1)).slice(0, 30).map((t) => taskOut(t, today)),
    missedBlocks: missed.map(blockOut),
    plan: plan ? { top3: plan.top3, firstActionTaskId: plan.firstActionTaskId, started: Boolean(plan.startedAt), closed: Boolean(plan.closedAt) } : null,
    inboxPending: inbox.length,
    cockpit: appLink("/"),
  };
}

export type TaskFilter = { status?: "open" | "todo" | "doing" | "done"; priority?: string | number; project?: string; dueBefore?: string; source?: string; limit?: number };

/** "Haute", "haute", 2 or "2" all mean the same priority. */
export function priorityOf(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  if (typeof value === "number") return value;
  if (/^[0-4]$/.test(value.trim())) return Number(value);
  return parsePriorityName(value);
}

export async function listTasks(f: TaskFilter = {}, now = nowMs()) {
  const today = parisDay(new Date(now));
  const status = f.status ?? "open";
  let rows: TaskView[];
  if (status === "done") {
    const done = await db.select().from(schema.tasks).where(eq(schema.tasks.status, "done"));
    const [ctx] = await Promise.all([loadContext()]);
    rows = done.flatMap((t) => {
      const source = ctx.sources.find((s) => s.id === t.sourceId && s.enabled);
      if (!source) return [];
      const project = ctx.projects.find((p) => p.id === t.projectId) ?? null;
      return [{ ...t, source, project, pillar: ctx.pillars.find((p) => p.id === project?.pillarId) ?? null, hidden: false, mine: false } as TaskView];
    });
  } else {
    rows = (await openTasks()).filter((t) => !needsTriage(t));
    if (status === "todo" || status === "doing") rows = rows.filter((t) => t.status === status);
  }
  const prio = priorityOf(f.priority);
  if (f.priority !== undefined && prio === null) throw new Error(`Priorité inconnue : ${f.priority} (Urgent, Haute, Moyenne, Basse, Aucune ou 0 à 4)`);
  if (prio !== null) rows = rows.filter((t) => (t.priority ?? 0) === prio);
  if (f.project) rows = rows.filter((t) => t.projectId === f.project || (t.project && fold(t.project.name).includes(fold(f.project!))));
  if (f.dueBefore) rows = rows.filter((t) => t.dueDate && t.dueDate <= f.dueBefore!);
  if (f.source) rows = rows.filter((t) => t.sourceId === f.source || fold(t.source.name).includes(fold(f.source!)));
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  return { count: rows.length, shown: Math.min(rows.length, limit), tasks: rows.slice(0, limit).map((t) => taskOut(t, today)) };
}

export async function getTask(id: string, now = nowMs()) {
  const t = await taskById(id);
  if (!t) throw new Error(`Tâche introuvable : ${id}`);
  const [blocks, changes] = await Promise.all([
    db.select().from(schema.blocks).where(eq(schema.blocks.taskId, id)),
    db.select().from(schema.changeLog).where(eq(schema.changeLog.entityId, id)).orderBy(desc(schema.changeLog.at)).limit(5),
  ]);
  return {
    ...taskOut(t, parisDay(new Date(now))),
    pillar: t.pillar?.name ?? null,
    assignee: t.assigneeName,
    blocks: blocks.filter((b) => b.status !== "dropped").map((b) => ({ id: b.id, title: b.title, start: local(b.start), end: local(b.end), status: b.status })),
    recentChanges: changes.map((c) => ({ at: c.at, field: c.field, before: c.before, after: c.after, via: c.via })),
  };
}

export async function listProjects() {
  const [ctx, tasks, links, goals] = await Promise.all([loadContext(), openTasks(), db.select().from(schema.goalLinks), db.select().from(schema.goals)]);
  return {
    projects: ctx.projects.map((p) => ({
      id: p.id,
      name: p.name,
      priority: p.protected ? "protégé (hors échelle)" : PRIORITY_LABEL[p.priority ?? 0],
      status: p.status,
      pillar: ctx.pillars.find((x) => x.id === p.pillarId)?.name ?? null,
      meteo: p.meteo,
      nextAction: p.nextAction,
      nextDue: p.nextDue,
      openTasks: tasks.filter((t) => t.projectId === p.id).length,
      goals: links.filter((l) => l.kind === "project" && l.refId === p.id).map((l) => goals.find((g) => g.id === l.goalId)?.title).filter(Boolean),
      url: p.url,
      cockpit: appLink(`/objectifs?vue=projets&p=${encodeURIComponent(p.id)}`),
    })),
  };
}

export async function listGoals(now = nowMs()) {
  const o = await goalsOverview(now);
  const out = (g: (typeof o.seasonGoals)[number]) => ({
    id: g.goal.id,
    title: g.goal.title,
    horizon: g.goal.horizon,
    status: g.goal.status,
    measure: g.goal.measure,
    progress: g.progress,
    signals: g.signals.map((s) => SIGNAL_LABEL[s]),
    pillar: g.pillarName,
    serves: g.parentTitle,
    due: g.goal.dueDate,
    thread: {
      projects: g.thread.projects.map((p) => ({ id: p.id, name: p.name, nextAction: p.nextAction, openTasks: p.tasks.length })),
      milestones: g.thread.milestones.map((m) => ({ id: m.id, name: m.name, date: m.date })),
      tasks: g.thread.looseTasks.map((t) => ({ id: t.id, title: t.title, due: t.dueDate })),
      habits: g.thread.habits.map((h) => h.name),
      blocks: g.thread.blocks.length,
    },
    cockpit: appLink(`/objectifs?g=${encodeURIComponent(g.goal.id)}`),
  });
  return {
    year: o.year ? { theme: o.year.theme, motto: o.year.motto } : null,
    season: o.season?.name ?? null,
    activeSeasonGoals: o.activeSeasonGoals,
    maxActivePerSeason: 3,
    seasonGoals: o.seasonGoals.map(out),
    yearGoals: o.yearGoals.map(out),
    priorityProjectsWithoutGoal: o.withoutGoal.map((p) => ({ id: p.id, name: p.name })),
  };
}

export async function getWeek(week: string | undefined, now = nowMs()) {
  const today = parisDay(new Date(now));
  const view = await reviewView(now, { create: false });
  const start = !week || week === "current" ? view.weekStart : week === "next" ? view.nextWeek : /^\d{4}-\d{2}-\d{2}$/.test(week) ? addDays(week, 1 - isoWeekday(week)) : null;
  if (!start) throw new Error('week doit être "current", "next" ou une date AAAA-MM-JJ');
  const blocks = await blocksBetween(start, addDays(start, 6));
  const planned = blocks.filter((b) => b.status !== "dropped").reduce((n, b) => n + (b.effort ?? 0), 0);
  const proposal = view.proposal && view.proposal.weekStart === start ? view.proposal : null;
  return {
    weekStart: start,
    isCurrent: start === weekStartOf(today),
    blocks: blocks.map(blockOut),
    points: { planned, budget: view.budget.budget, velocity: view.budget.velocity, over: planned > view.budget.budget },
    reviewProposal: proposal ? { blocks: proposal.blocks.filter((b) => !b.excluded).length, notPlaced: proposal.unplaced.length } : null,
    cockpit: appLink("/semaine"),
  };
}

export async function search(query: string) {
  return { hits: (await searchAll(query)).map((h) => ({ id: h.id, kind: h.kind, label: h.label, hint: h.hint ?? null, cockpit: appLink(h.href) })) };
}

export async function getHabits(now = nowMs()) {
  const w = await habitWeeks(now);
  return {
    weekStart: w.start,
    note: "pct = part des jours faits cette semaine ; 80 % fait une semaine pleine ; pas de compteur de série",
    habits: w.habits.map((h) => ({ id: h.id, name: h.name, protected: h.protected, targetPct: h.targetPct, pct: h.pct, days: h.days.map((d) => ({ day: d.day, done: d.done })), missedTwoWeeksInARow: h.twoMisses })),
  };
}

export async function getInbox() {
  const items = await pendingInbox();
  return { count: items.length, items: items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, text: i.text, due: i.dueDate, time: i.dueTime, suggestedSourceId: i.suggestedSourceId, createdAt: i.createdAt })), cockpit: appLink("/inbox") };
}

export async function proposalsList(status?: "pending" | "accepted" | "rejected" | "expired") {
  const rows = await listProposals({ status, limit: 50 });
  return { proposals: rows.map((p) => ({ id: p.id, kind: p.kind, status: p.status, summary: p.summary.title, details: p.summary.lines, rationale: p.rationale, createdAt: p.createdAt, decidedAt: p.decidedAt, result: p.result })), cockpit: appLink("/propositions") };
}
