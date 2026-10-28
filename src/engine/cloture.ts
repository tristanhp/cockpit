import type { DaySnapshot } from "@/db/schema";
import { addDays, isoWeekday, parisDay } from "@/lib/dates";

// Pure rules of the clôture and the cap: the three priorities, the première action, what changed
// overnight and the weekly habit percentage. The screens and the database live elsewhere.

// ---- Demain: three priorities and a first action ------------------------------

export type Candidate = { id: string; title: string; priority: number | null; dueDate: string | null; effort: number | null };

const prioRank = (p: number | null) => (p === 1 ? 0 : p === 2 ? 1 : 9);

const pressing = (t: Candidate, day: string) => (t.dueDate !== null && t.dueDate <= day ? 0 : 1);

/** Most pressing first: due dates already reached, then priority, then the nearest due date. */
export function rankTasks(tasks: Candidate[], day: string): Candidate[] {
  return [...tasks].sort(
    (a, b) =>
      pressing(a, day) - pressing(b, day) ||
      prioRank(a.priority) - prioRank(b.priority) ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
      (a.effort ?? 99) - (b.effort ?? 99) ||
      a.title.localeCompare(b.title, "fr"),
  );
}

/** At most three open tasks for `day`: Urgent and Haute work, plus anything due on or before that day. */
export function suggestTop3(tasks: Candidate[], day: string): Candidate[] {
  return rankTasks(
    tasks.filter((t) => prioRank(t.priority) < 9 || (t.dueDate !== null && t.dueDate <= day)),
    day,
  ).slice(0, 3);
}

/** Small enough to start without ceremony. */
export const EASY_EFFORT = 3;

/** The task to open the day with: the most pressing of the three that is easy to start, else the first. */
export function pickFirstAction(top3: Candidate[]): Candidate | null {
  return top3.find((t) => t.effort !== null && t.effort <= EASY_EFFORT) ?? top3[0] ?? null;
}

// ---- What changed overnight ----------------------------------------------------

export type SnapEvent = DaySnapshot["events"][number];
export type SnapTask = DaySnapshot["tasks"][number];

const overlaps = (a: SnapEvent, b: SnapEvent) => Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);

/** Pairs "block|event" where a block overlaps something that is not a block, as sorted id keys. */
export function findClashes(events: SnapEvent[]): string[] {
  const out: string[] = [];
  for (const b of events.filter((e) => e.kind === "block"))
    for (const e of events) if (e.kind !== "block" && overlaps(b, e)) out.push([b.id, e.id].sort().join("|"));
  return out.sort();
}

const dayOf = (iso: string) => parisDay(iso);

export function buildSnapshot(input: { from: string; days: number; tasks: SnapTask[]; events: SnapEvent[] }): DaySnapshot {
  const to = addDays(input.from, input.days);
  const events = input.events.filter((e) => dayOf(e.start) >= input.from && dayOf(e.start) <= to);
  return { from: input.from, to, tasks: input.tasks, events, clashes: findClashes(events) };
}

export type SnapshotDiff = {
  newTasks: SnapTask[];
  changedTasks: { id: string; title: string; from: string | null; to: string | null }[];
  movedEvents: { id: string; title: string; from: { start: string; end: string }; to: { start: string; end: string } }[];
  newEvents: SnapEvent[];
  newClashes: { block: string; event: string }[];
};

export const isEmptyDiff = (d: SnapshotDiff) => !d.newTasks.length && !d.changedTasks.length && !d.movedEvents.length && !d.newEvents.length && !d.newClashes.length;

/**
 * Compares the evening's snapshot with now. Events are only compared inside the days both
 * snapshots cover, so the window sliding forward is not mistaken for a change.
 */
export function diffSnapshots(prev: DaySnapshot, curr: DaySnapshot): SnapshotDiff {
  const lo = prev.from > curr.from ? prev.from : curr.from;
  const hi = prev.to < curr.to ? prev.to : curr.to;
  const inRange = (e: SnapEvent) => dayOf(e.start) >= lo && dayOf(e.start) <= hi;
  const before = new Map(prev.events.filter(inRange).map((e) => [e.id, e]));
  const prevTasks = new Map(prev.tasks.map((t) => [t.id, t]));

  const diff: SnapshotDiff = { newTasks: [], changedTasks: [], movedEvents: [], newEvents: [], newClashes: [] };
  for (const t of curr.tasks) {
    const old = prevTasks.get(t.id);
    if (!old) diff.newTasks.push(t);
    else if (old.due !== t.due) diff.changedTasks.push({ id: t.id, title: t.title, from: old.due, to: t.due });
  }
  const currEvents = curr.events.filter(inRange);
  for (const e of currEvents) {
    const old = before.get(e.id);
    if (!old) diff.newEvents.push(e);
    else if (old.start !== e.start || old.end !== e.end) diff.movedEvents.push({ id: e.id, title: e.title, from: { start: old.start, end: old.end }, to: { start: e.start, end: e.end } });
  }
  const known = new Set(prev.clashes);
  const title = new Map(curr.events.map((e) => [e.id, e.title]));
  for (const key of curr.clashes) {
    if (known.has(key)) continue;
    const [a, b] = key.split("|");
    const [block, event] = curr.events.find((e) => e.id === a)?.kind === "block" ? [a, b] : [b, a];
    diff.newClashes.push({ block: title.get(block) ?? block, event: title.get(event) ?? event });
  }
  return diff;
}

// ---- Habits --------------------------------------------------------------------

/** Monday of the week containing `day`. */
export const weekStart = (day: string) => addDays(day, 1 - isoWeekday(day));

export type Log = { day: string; done: boolean };

/**
 * Share of days done in the week starting `start`, as a rounded percentage. A week still running is
 * measured on the days that have passed (today included), so a Tuesday at 2/2 reads 100 %, not 29 %.
 */
export function weeklyPct(logs: Log[], start: string, today: string): number {
  const elapsed = Math.min(7, Math.max(0, daysBetween(start, today) + 1));
  if (elapsed === 0) return 0;
  const end = addDays(start, 6);
  const done = logs.filter((l) => l.done && l.day >= start && l.day <= end && l.day <= today).length;
  return Math.round((done / elapsed) * 100);
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * "Jamais deux fois de suite": the last two finished weeks both under target. A week without any log
 * is not counted (nothing was tracked, so there is nothing to miss), which keeps a new habit quiet.
 */
export function missedTwoWeeks(logs: Log[], targetPct: number, today: string): boolean {
  const thisWeek = weekStart(today);
  return [-14, -7].every((offset) => {
    const start = addDays(thisWeek, offset);
    const end = addDays(start, 6);
    if (!logs.some((l) => l.day >= start && l.day <= end)) return false;
    return weeklyPct(logs, start, end) < targetPct;
  });
}
