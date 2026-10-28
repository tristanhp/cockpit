import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DayPlanRow, DaySnapshot, Habit } from "@/db/schema";
import { buildSnapshot, diffSnapshots, isEmptyDiff, missedTwoWeeks, pickFirstAction, rankTasks, suggestTop3, weekStart, weeklyPct, type Candidate, type SnapshotDiff } from "@/engine/cloture";
import { canWriteCalendar, kindOfRole } from "@/engine/planning";
import { addDays, formatTime, nowMs, parisDay, parisMinutes } from "@/lib/dates";
import { needsTriage, openTasks, pendingInbox, type TaskView } from "@/lib/queries";
import { applyLeftover, applyReplanOption, blocksBetween, dayForLater, missedBlocks, moveBlockToNow, scheduleTask, type BlockView, type LeftoverChoice } from "@/planning";
import { changeTask } from "@/writeback";
import { loadRitualSettings, minutesOf, capTimeFor, type RitualSettings } from "./settings";

// The two daily rituals. This file reads and writes the database; the rules live in
// `src/engine/cloture.ts`, and every change to a plan goes through the S3 planning code.

const asCandidate = (t: TaskView): Candidate => ({ id: t.id, title: t.title, priority: t.priority, dueDate: t.dueDate, effort: t.effort });

/** Open tasks that are yours: Linear tickets nobody gave you are not part of the plan. */
async function myOpenTasks(): Promise<TaskView[]> {
  return (await openTasks()).filter((t) => !needsTriage(t));
}

// ---- Day plans -------------------------------------------------------------------

export async function planOf(day: string): Promise<DayPlanRow | null> {
  return (await db.query.dayPlans.findFirst({ where: eq(schema.dayPlans.day, day) })) ?? null;
}

async function patchPlan(day: string, patch: Partial<Omit<DayPlanRow, "day">>): Promise<void> {
  await db.insert(schema.dayPlans).values({ day, ...patch }).onConflictDoUpdate({ target: schema.dayPlans.day, set: patch });
}

/** What the plan looks like right now, for the snapshot taken at closing and the diff on the morning after. */
export async function currentSnapshot(day: string): Promise<DaySnapshot> {
  const [tasks, events, sources, blocks] = await Promise.all([
    myOpenTasks(),
    db.select().from(schema.events).where(and(gte(schema.events.day, day), lte(schema.events.day, addDays(day, 7)))),
    db.select().from(schema.sources).where(and(eq(schema.sources.kind, "gcal"), eq(schema.sources.enabled, true))),
    db.select({ id: schema.blocks.id }).from(schema.blocks).where(eq(schema.blocks.status, "dropped")),
  ]);
  const role = new Map(sources.map((s) => [s.id, s.config.calendarRole]));
  const dropped = new Set(blocks.map((b) => b.id));
  return buildSnapshot({
    from: day,
    days: 7,
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, due: t.dueDate })),
    events: events
      .filter((e) => !e.allDay && role.has(e.sourceId) && !dropped.has(e.id))
      .map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, kind: canWriteCalendar(role.get(e.sourceId)) ? ("block" as const) : kindOfRole(role.get(e.sourceId)) })),
  });
}

// ---- Restes ------------------------------------------------------------------------

export type Leftover = { kind: "block" | "task"; id: string; title: string; meta: string };

/** Everything waiting to be replaced: missed blocks, then late tasks that have no block coming. */
export async function leftovers(day: string, now = nowMs()): Promise<Leftover[]> {
  const [missed, tasks, upcoming] = await Promise.all([missedBlocks(), myOpenTasks(), blocksBetween(day, addDays(day, 14))]);
  const covered = new Set(missed.map((b) => b.taskId).filter(Boolean));
  for (const b of upcoming) if (b.taskId && b.status !== "missed" && Date.parse(b.end) > now) covered.add(b.taskId);
  return [
    ...missed.map((b: BlockView) => ({ kind: "block" as const, id: b.id, title: b.title, meta: `bloc du ${parisDay(b.start)}` })),
    ...tasks.filter((t) => t.dueDate && t.dueDate < day && !covered.has(t.id)).map((t) => ({ kind: "task" as const, id: t.id, title: t.title, meta: `échue le ${t.dueDate}` })),
  ];
}

export async function resolveLeftover(kind: "block" | "task", id: string, choice: LeftoverChoice, now = nowMs()): Promise<void> {
  if (kind === "block") return applyLeftover(id, choice, now);
  const today = parisDay(new Date(now));
  if (choice === "drop") {
    // "Abandonner": the task leaves the plan for good here; it stays untouched in its source.
    await db
      .insert(schema.taskOverrides)
      .values({ taskId: id, hidden: true, updatedAt: new Date(now).toISOString() })
      .onConflictDoUpdate({ target: schema.taskOverrides.taskId, set: { hidden: true, updatedAt: new Date(now).toISOString() } });
    return;
  }
  const to = choice === "tomorrow" ? addDays(today, 1) : await dayForLater(id, today, now);
  await changeTask(id, "dueDate", to);
}

// ---- La clôture --------------------------------------------------------------------

export type ClotureData = {
  day: string;
  tomorrow: string;
  late: boolean;
  closed: boolean;
  settings: RitualSettings;
  bilan: { blocksKept: number; blocksPlanned: number; tasksDone: number; points: number };
  leftovers: Leftover[];
  inbox: { id: string; title: string; kind: "task" | "idea" | "event"; dueDate: string | null; dueTime: string | null; sourceId: string | null; sourceName: string | null; projectName: string | null }[];
  olderInbox: number;
  sources: { id: string; name: string }[];
  pool: { id: string; title: string; priority: number | null; dueDate: string | null; effort: number | null; project: string | null }[];
  suggested: string[];
  firstAction: string | null;
  habits: { id: string; name: string; protected: boolean; done: boolean }[];
};

export async function clotureData(now = nowMs()): Promise<ClotureData> {
  const day = parisDay(new Date(now));
  const settings = await loadRitualSettings();
  const [plan, blocks, left, inbox, sources, projects, tasks, habits, logs, changes] = await Promise.all([
    planOf(day),
    blocksBetween(day, day),
    leftovers(day, now),
    pendingInbox(),
    db.select().from(schema.sources).where(eq(schema.sources.role, "tasks")),
    db.select({ id: schema.projects.id, name: schema.projects.name }).from(schema.projects),
    myOpenTasks(),
    activeHabits(),
    db.select().from(schema.habitLogs).where(eq(schema.habitLogs.day, day)),
    db.select().from(schema.changeLog).where(and(eq(schema.changeLog.field, "done"), eq(schema.changeLog.undone, false), gte(schema.changeLog.at, new Date(now - 36 * 3_600_000).toISOString()))),
  ]);

  const live = blocks.filter((b) => b.status !== "dropped");
  const doneBlocks = live.filter((b) => b.status === "done");
  const doneToday = new Set([...doneBlocks.map((b) => b.taskId).filter(Boolean), ...changes.filter((c) => c.after === true && parisDay(c.at) === day).map((c) => c.entityId)]);
  const tomorrow = addDays(day, 1);
  const today = inbox.filter((i) => parisDay(i.createdAt) === day);
  const ticked = new Map(logs.map((l) => [l.habitId, l.done]));
  const suggestion = suggestTop3(tasks.map(asCandidate), tomorrow);
  const name = (id: string | null, list: { id: string; name: string }[]) => list.find((x) => x.id === id)?.name ?? null;

  return {
    day,
    tomorrow,
    late: parisMinutes(new Date(now)) >= minutesOf(settings.hardStop),
    closed: Boolean(plan?.closedAt),
    settings,
    bilan: { blocksKept: doneBlocks.length, blocksPlanned: live.length, tasksDone: doneToday.size, points: doneBlocks.reduce((n, b) => n + (b.effort ?? 0), 0) },
    leftovers: left,
    inbox: today.map((i) => ({ id: i.id, title: i.title, kind: i.kind, dueDate: i.dueDate, dueTime: i.dueTime, sourceId: i.suggestedSourceId, sourceName: name(i.suggestedSourceId, sources), projectName: name(i.suggestedProjectId, projects) })),
    olderInbox: inbox.length - today.length,
    sources: sources.map((s) => ({ id: s.id, name: s.name })),
    pool: rankTasks(tasks.map(asCandidate), tomorrow)
      .slice(0, 15)
      .map((c) => ({ ...c, project: tasks.find((t) => t.id === c.id)?.project?.name ?? null })),
    suggested: suggestion.map((t) => t.id),
    firstAction: pickFirstAction(suggestion)?.id ?? null,
    habits: habits.map((h) => ({ id: h.id, name: h.name, protected: h.protected, done: ticked.get(h.id) ?? false })),
  };
}

export type CloseInput = { top3: string[]; firstActionTaskId: string | null; habits: Record<string, boolean> };

/** Closes today: stores the snapshot and the habit logs, and writes tomorrow's plan. */
export async function closeDay(input: CloseInput, now = nowMs()): Promise<void> {
  const day = parisDay(new Date(now));
  const top3 = [...new Set(input.top3)].slice(0, 3);
  if (input.firstActionTaskId && !top3.includes(input.firstActionTaskId)) throw new Error("La première action doit faire partie des trois priorités");
  const habits = await activeHabits();
  const snapshot = await currentSnapshot(day);
  await patchPlan(day, { closedAt: new Date(now).toISOString(), snapshot });
  await patchPlan(addDays(day, 1), { top3, firstActionTaskId: input.firstActionTaskId, startedAt: null, catchUpAt: null });
  for (const h of habits) {
    const done = Boolean(input.habits[h.id]);
    await db.insert(schema.habitLogs).values({ habitId: h.id, day, done }).onConflictDoUpdate({ target: [schema.habitLogs.habitId, schema.habitLogs.day], set: { done } });
  }
}

// ---- Le cap ------------------------------------------------------------------------

export type CapData = {
  day: string;
  capTime: string;
  /** The card shows from the cap time until C'est parti. */
  visible: boolean;
  suggestedOnly: boolean;
  top3: { id: string; title: string; block: { id: string; start: string; end: string } | null }[];
  firstAction: { id: string; title: string } | null;
  diff: SnapshotDiff | null;
  catchUp: { leftovers: Leftover[]; inbox: number } | null;
  pool: { id: string; title: string }[];
};

export async function capData(now = nowMs()): Promise<CapData> {
  const day = parisDay(new Date(now));
  const settings = await loadRitualSettings();
  const capTime = capTimeFor(settings, day);
  const [plan, yesterday, tasks, blocks, everClosed] = await Promise.all([
    planOf(day),
    planOf(addDays(day, -1)),
    myOpenTasks(),
    blocksBetween(day, day),
    db.select({ day: schema.dayPlans.day }).from(schema.dayPlans).where(isNotNull(schema.dayPlans.closedAt)).limit(1),
  ]);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const candidates = tasks.map(asCandidate);
  const planned = (plan?.top3 ?? []).filter((id) => byId.has(id));
  const suggestedOnly = !plan || planned.length === 0;
  const ids = suggestedOnly ? suggestTop3(candidates, day).map((c) => c.id) : planned;
  const firstId = !suggestedOnly && plan?.firstActionTaskId && byId.has(plan.firstActionTaskId) ? plan.firstActionTaskId : (pickFirstAction(ids.map((id) => candidates.find((c) => c.id === id)!))?.id ?? null);

  // Yesterday's clôture was skipped: only once the ritual has been used lately, so a first day shows nothing.
  const skipped = !yesterday?.closedAt && everClosed.length > 0;
  const catchUpOpen = skipped && !plan?.catchUpAt;
  const diff = yesterday?.snapshot ? diffSnapshots(yesterday.snapshot, await currentSnapshot(day)) : null;
  const left = catchUpOpen ? await leftovers(day, now) : [];

  return {
    day,
    capTime,
    visible: parisMinutes(new Date(now)) >= minutesOf(capTime) && !plan?.startedAt && !plan?.closedAt,
    suggestedOnly,
    top3: ids.map((id) => ({ id, title: byId.get(id)!.title, block: blocks.filter((b) => b.taskId === id && b.status !== "dropped").map((b) => ({ id: b.id, start: b.start, end: b.end }))[0] ?? null })),
    firstAction: firstId ? { id: firstId, title: byId.get(firstId)!.title } : null,
    diff: diff && !isEmptyDiff(diff) ? diff : null,
    catchUp: catchUpOpen ? { leftovers: left, inbox: (await pendingInbox()).length } : null,
    pool: rankTasks(candidates, day).slice(0, 15).map((c) => ({ id: c.id, title: c.title })),
  };
}

/** Ajuster: the three priorities in their new order and the première action. */
export async function adjustPlan(top3: string[], firstActionTaskId: string | null, now = nowMs()): Promise<void> {
  const ids = [...new Set(top3)].slice(0, 3);
  if (firstActionTaskId && !ids.includes(firstActionTaskId)) throw new Error("La première action doit faire partie des trois priorités");
  await patchPlan(parisDay(new Date(now)), { top3: ids, firstActionTaskId });
}

export async function dismissCatchUp(now = nowMs()): Promise<void> {
  await patchPlan(parisDay(new Date(now)), { catchUpAt: new Date(now).toISOString() });
}

/**
 * C'est parti: the day starts. The block of the première action is brought to now so that the
 * Maintenant strip takes over; with no block, one is planned from now. Returns what happened.
 */
export async function startDay(now = nowMs()): Promise<string> {
  const day = parisDay(new Date(now));
  const cap = await capData(now);
  await patchPlan(day, { startedAt: new Date(now).toISOString(), top3: cap.top3.map((t) => t.id), firstActionTaskId: cap.firstAction?.id ?? null });
  const first = cap.firstAction;
  if (!first) return "C'est parti.";
  const block = (await blocksBetween(day, day)).find((b) => b.taskId === first.id && ["planned", "proposed"].includes(b.status) && Date.parse(b.end) > now);
  if (block && Date.parse(block.start) <= now) return `C'est parti : « ${first.title} » est en cours.`;
  try {
    if (block) await moveBlockToNow(block.id, now);
    else await scheduleTask(first.id, localStart(day, now), now);
    return `C'est parti : « ${first.title} » est en cours.`;
  } catch {
    // Something protected sits on this minute: take the first free slot instead.
    try {
      if (block) {
        await applyReplanOption(block.id, "auto");
        const moved = await db.query.blocks.findFirst({ where: eq(schema.blocks.id, block.id) });
        return `C'est parti. « ${first.title} » est replacée à ${moved ? formatTime(moved.start) : "plus tard"}.`;
      }
      const planned = await scheduleTask(first.id, undefined, now);
      return `C'est parti. « ${first.title} » est planifiée à ${formatTime(planned.start)}.`;
    } catch (e) {
      return `C'est parti. (Pas de bloc posé : ${e instanceof Error ? e.message : "créneau indisponible"})`;
    }
  }
}

/** "YYYY-MM-DDTHH:mm" in Paris time, rounded down to five minutes. */
function localStart(day: string, now: number): string {
  const m = parisMinutes(new Date(now));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day}T${pad(Math.floor(m / 60))}:${pad(Math.floor((m % 60) / 5) * 5)}`;
}

// ---- Habits -------------------------------------------------------------------------

export async function activeHabits(): Promise<Habit[]> {
  const rows = await db.select().from(schema.habits).where(eq(schema.habits.active, true)).orderBy(asc(schema.habits.sortOrder), asc(schema.habits.name));
  return [...rows].sort((a, b) => Number(b.protected) - Number(a.protected));
}

export type HabitWeek = { id: string; name: string; protected: boolean; targetPct: number; pct: number; days: { day: string; done: boolean | null }[]; twoMisses: boolean };

/** This week's row of seven days and percentage for every active habit. `done` is null for days not logged yet. */
export async function habitWeeks(now = nowMs()): Promise<{ today: string; start: string; habits: HabitWeek[] }> {
  const today = parisDay(new Date(now));
  const start = weekStart(today);
  const [habits, logs] = await Promise.all([activeHabits(), db.select().from(schema.habitLogs).where(gte(schema.habitLogs.day, addDays(start, -21)))]);
  return {
    today,
    start,
    habits: habits.map((h) => {
      const own = logs.filter((l) => l.habitId === h.id);
      return {
        id: h.id,
        name: h.name,
        protected: h.protected,
        targetPct: h.targetPct,
        pct: weeklyPct(own, start, today),
        days: Array.from({ length: 7 }, (_, i) => {
          const d = addDays(start, i);
          return { day: d, done: own.find((l) => l.day === d)?.done ?? null };
        }),
        twoMisses: missedTwoWeeks(own, h.targetPct, today),
      };
    }),
  };
}
