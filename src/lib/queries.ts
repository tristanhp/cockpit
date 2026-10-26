import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CalendarEvent, Pillar, Project, Source, Task } from "@/db/schema";
import { addDays, parisDay } from "./dates";

export type TaskView = Task & { source: Source; project: Project | null; pillar: Pillar | null };

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
  const [rows, ctx] = await Promise.all([
    db.select().from(schema.tasks).where(ne(schema.tasks.status, "done")),
    loadContext(),
  ]);
  const enabled = new Map(ctx.sources.filter((s) => s.enabled).map((s) => [s.id, s]));
  return rows
    .filter((t) => enabled.has(t.sourceId))
    .map((t) => {
      const project = ctx.projects.find((p) => p.id === t.projectId) ?? null;
      return { ...t, source: enabled.get(t.sourceId)!, project, pillar: ctx.pillars.find((p) => p.id === project?.pillarId) ?? null };
    })
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.title.localeCompare(b.title, "fr"));
}

/** Linear tickets nobody gave you: the revue rule is to ask, never to decide. */
export const needsTriage = (t: TaskView) => t.source.kind === "linear" && !t.assignedToMe;

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
