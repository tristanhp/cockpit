import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CalendarEvent, Pillar, Project, Source, Task } from "@/db/schema";
import { addDays, parisDay } from "./dates";

export type TaskView = Task & { source: Source; project: Project | null; pillar: Pillar | null; hidden: boolean; mine: boolean };

export async function loadContext() {
  const [sources, projects, pillars, levels] = await Promise.all([
    db.select().from(schema.sources),
    db.select().from(schema.projects),
    db.select().from(schema.pillars).orderBy(asc(schema.pillars.sortOrder)),
    db.select().from(schema.levels).orderBy(asc(schema.levels.sortOrder)),
  ]);
  return { sources, projects, pillars, levels };
}

export async function openTasks(): Promise<TaskView[]> {
  return taskViews(db.select().from(schema.tasks).where(ne(schema.tasks.status, "done")));
}

/** One task whatever its status, so a task just marked done can still be reopened from its panel. */
export async function taskById(id: string): Promise<TaskView | null> {
  return (await taskViews(db.select().from(schema.tasks).where(eq(schema.tasks.id, id)), true))[0] ?? null;
}

async function taskViews(query: Promise<Task[]>, keepHidden = false): Promise<TaskView[]> {
  const [rows, ctx, overrides] = await Promise.all([query, loadContext(), db.select().from(schema.taskOverrides)]);
  const flags = new Map(overrides.map((o) => [o.taskId, o]));
  const enabled = new Map(ctx.sources.filter((s) => s.enabled).map((s) => [s.id, s]));
  return rows
    .filter((t) => enabled.has(t.sourceId))
    .map((t) => {
      const project = ctx.projects.find((p) => p.id === t.projectId) ?? null;
      const flag = flags.get(t.id);
      return {
        ...t,
        source: enabled.get(t.sourceId)!,
        project,
        pillar: ctx.pillars.find((p) => p.id === project?.pillarId) ?? null,
        hidden: flag?.hidden ?? false,
        mine: flag?.mine ?? false,
      };
    })
    .filter((t) => keepHidden || !t.hidden)
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || (a.priority || 5) - (b.priority || 5) || a.title.localeCompare(b.title, "fr"));
}

/** Linear tickets nobody gave you: the revue rule is to ask, never to decide. */
export const needsTriage = (t: TaskView) => t.source.kind === "linear" && !t.assignedToMe && !t.mine;

export async function eventsForDay(day: string): Promise<(CalendarEvent & { source: Source })[]> {
  const [rows, sources] = await Promise.all([
    db
      .select()
      .from(schema.events)
      .where(and(gte(schema.events.day, addDays(day, -30)), lte(schema.events.day, day))),
    db.select().from(schema.sources).where(eq(schema.sources.enabled, true)),
  ]);
  return rows
    .filter((e) => (e.allDay ? e.day <= day && parisDay(e.end) > day : e.day === day))
    .flatMap((e) => {
      const source = sources.find((s) => s.id === e.sourceId);
      return source ? [{ ...e, source }] : [];
    })
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
}

export async function upcomingMilestones(fromDay: string, days: number) {
  const rows = await db
    .select()
    .from(schema.milestones)
    .where(and(gte(schema.milestones.startDate, fromDay), lte(schema.milestones.startDate, addDays(fromDay, days))))
    .orderBy(asc(schema.milestones.startDate));
  return rows;
}

export async function upcomingExams(fromDay: string, days: number) {
  return db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.isExam, true), gte(schema.events.day, fromDay), lte(schema.events.day, addDays(fromDay, days))))
    .orderBy(asc(schema.events.start));
}

export async function lastSync(): Promise<string | null> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, "last_sync") });
  return (row?.value as string) ?? null;
}

export async function pendingInbox() {
  return db.select().from(schema.inbox).where(eq(schema.inbox.status, "pending")).orderBy(asc(schema.inbox.createdAt));
}
