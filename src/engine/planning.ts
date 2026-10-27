import { addDays, isoWeekday, parisInstant } from "@/lib/dates";

// Pure planning rules: free slots, placing a task, replanning a day, learning durations.
// Times are epoch milliseconds; "days" are Europe/Paris YYYY-MM-DD strings.

export const MIN = 60_000;
export type Interval = { start: number; end: number };

export type PlanningSettings = {
  /** ISO weekdays work can be planned on (1 Monday … 7 Sunday). Sunday is never in the default. */
  workDays: number[];
  startMin: number;
  endMin: number;
  /** Minutes after a block ends before it counts as missed. */
  graceMin: number;
  /** Block length when the task type is unknown. */
  defaultBlockMin: number;
};

export const DEFAULT_SETTINGS: PlanningSettings = { workDays: [1, 2, 3, 4, 5, 6], startMin: 9 * 60, endMin: 22 * 60, graceMin: 10, defaultBlockMin: 90 };

// ---- Calendars ---------------------------------------------------------------

export type CalendarRole = "travail" | "perso" | "socle" | "cours" | "engagement";

/** Cockpit only ever creates, moves or deletes events on these calendars. */
export const WRITABLE_ROLES: CalendarRole[] = ["travail", "perso"];
export const canWriteCalendar = (role: string | undefined): boolean => WRITABLE_ROLES.includes(role as CalendarRole);

export function assertWritableCalendar(role: string | undefined): void {
  if (!canWriteCalendar(role)) throw new Error("Cockpit n'écrit que dans les agendas « travail » et « perso »");
}

export type BusyKind = "protected" | "avoided" | "busy";

/** socle and cours are protected, engagement is avoided, anything else already on the plan is busy. */
export function kindOfRole(role: string | undefined): BusyKind {
  if (role === "socle" || role === "cours") return "protected";
  if (role === "engagement") return "avoided";
  return "busy";
}

export type BusyEvent = Interval & { id: string; kind: BusyKind };
export type Slot = Interval & { avoidedIds: string[] };

// ---- Free slots --------------------------------------------------------------

const merge = (list: Interval[]): Interval[] => {
  const sorted = [...list].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
};

const subtract = (from: Interval, hole: Interval[]): Interval[] => {
  let rest = [from];
  for (const h of hole) rest = rest.flatMap((r) => (h.end <= r.start || h.start >= r.end ? [r] : [{ start: r.start, end: Math.max(r.start, h.start) }, { start: Math.min(r.end, h.end), end: r.end }].filter((x) => x.end > x.start)));
  return rest;
};

export function workWindow(day: string, s: PlanningSettings): Interval | null {
  if (!s.workDays.includes(isoWeekday(day))) return null;
  return { start: parisInstant(day, s.startMin), end: parisInstant(day, s.endMin) };
}

/**
 * Free intervals inside the work window, after removing protected and busy events.
 * Stretches that only exist by overlapping an avoided event are kept but tagged with that
 * event's id in `avoidedIds`: they are usable only with the user's approval.
 */
export function freeSlots(events: BusyEvent[], days: string[], settings: PlanningSettings = DEFAULT_SETTINGS): Slot[] {
  const out: Slot[] = [];
  for (const day of days) {
    const win = workWindow(day, settings);
    if (!win) continue;
    const hard = merge(events.filter((e) => e.kind !== "avoided"));
    const avoided = events.filter((e) => e.kind === "avoided");
    for (const base of subtract(win, hard)) {
      let clean = [base];
      const soft: Slot[] = [];
      for (const a of merge(avoided)) {
        const overlap = { start: Math.max(a.start, base.start), end: Math.min(a.end, base.end) };
        if (overlap.end <= overlap.start) continue;
        clean = clean.flatMap((c) => subtract(c, [overlap]));
        soft.push({ ...overlap, avoidedIds: avoided.filter((e) => e.start < overlap.end && e.end > overlap.start).map((e) => e.id) });
      }
      out.push(...clean.map((c) => ({ ...c, avoidedIds: [] })), ...soft);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export const isUsable = (slot: Slot, allowAvoided: string[] = []) => slot.avoidedIds.every((id) => allowAvoided.includes(id));

export function consume(slots: Slot[], used: Interval): Slot[] {
  return slots.flatMap((s) => subtract(s, [used]).map((r) => ({ ...r, avoidedIds: s.avoidedIds })));
}

// ---- Durations and learning -------------------------------------------------

export type TaskType = { minutesPerPoint: number | null; samples: number };

const roundUp = (minutes: number, step = 15) => Math.ceil(minutes / step) * step;

/** Effort points × learned minutes per point, else the default block length. */
export function durationFor(task: { effort: number | null }, type: TaskType | undefined, settings: PlanningSettings = DEFAULT_SETTINGS): number {
  if (task.effort && type?.minutesPerPoint) return Math.max(15, roundUp(task.effort * type.minutesPerPoint));
  return settings.defaultBlockMin;
}

const ALPHA = 0.3;

/** Exponential moving average of minutes per point, from a block that ended done. */
export function learnMinutesPerPoint(type: TaskType, actualMinutes: number, effort: number | null): TaskType {
  if (!effort || actualMinutes <= 0) return type;
  const sample = actualMinutes / effort;
  const next = type.minutesPerPoint == null ? sample : (1 - ALPHA) * type.minutesPerPoint + ALPHA * sample;
  return { minutesPerPoint: Math.round(next * 10) / 10, samples: type.samples + 1 };
}

// ---- Mandatory work ----------------------------------------------------------

/** Mandatory = Urgent, or Haute due within 48 h, or a graded deliverable. */
export function isMandatory(t: { priority: number | null; dueDate: string | null; graded?: boolean }, today: string): boolean {
  if (t.graded) return true;
  if (t.priority === 1) return true;
  return t.priority === 2 && t.dueDate !== null && t.dueDate <= addDays(today, 2);
}

// ---- Placing -----------------------------------------------------------------

export type PlaceInput = { minutes: number; priority: number | null; dueDate: string | null };
export type PlaceOptions = {
  now: number;
  allowAvoided?: string[];
  /** Existing blocks: starting right after or before one earns a contiguity bonus. */
  neighbours?: Interval[];
  /** Only consider slots starting at or after / before these instants. */
  notBefore?: number;
  notAfter?: number;
};
export type Placement = Interval & { score: number; reasons: string[]; late: boolean };

const roundUpTo = (ms: number, step = 15 * MIN) => Math.ceil(ms / step) * step;
const WEIGHT: Record<number, number> = { 1: 3, 2: 2, 3: 1.2, 4: 0.8, 0: 0.8 };

/** Best slot for a task: due-date pressure, priority, contiguity; never in the past nor over a protected event. */
export function placeTask(task: PlaceInput, slots: Slot[], opts: PlaceOptions): Placement | null {
  const dueEnd = task.dueDate ? parisInstant(addDays(task.dueDate, 1), 0) : null;
  const w = WEIGHT[task.priority ?? 0] ?? 1;
  const need = task.minutes * MIN;
  let best: Placement | null = null;
  for (const slot of slots) {
    if (!isUsable(slot, opts.allowAvoided)) continue;
    const start = roundUpTo(Math.max(slot.start, opts.now, opts.notBefore ?? 0));
    const end = start + need;
    if (end > slot.end || (opts.notAfter !== undefined && start > opts.notAfter)) continue;
    const reasons: string[] = [];
    let score = ((start - opts.now) / (60 * MIN)) * w;
    const late = dueEnd !== null && end > dueEnd;
    if (late) {
      score += 1000 + (end - dueEnd!) / (60 * MIN);
      reasons.push("après l'échéance");
    } else if (dueEnd !== null) reasons.push("avant l'échéance");
    if (opts.neighbours?.some((n) => Math.abs(n.end - start) <= 15 * MIN || Math.abs(n.start - end) <= 15 * MIN)) {
      score -= 2 / w;
      reasons.push("dans la continuité d'un autre bloc");
    }
    if (slot.avoidedIds.length) reasons.push("chevauche un engagement validé");
    if (!best || score < best.score) best = { start, end, score, reasons, late };
  }
  return best;
}

/** Two halves in the best two places, for "Découper en deux". */
export function placeSplit(task: PlaceInput, slots: Slot[], opts: PlaceOptions): [Placement, Placement] | null {
  const half = Math.max(30, roundUp(task.minutes / 2));
  const first = placeTask({ ...task, minutes: half }, slots, opts);
  if (!first) return null;
  const second = placeTask({ ...task, minutes: half }, consume(slots, first), opts);
  return second ? [first, second] : null;
}

// ---- Replanning a day --------------------------------------------------------

export type PlanItem = {
  blockId: string;
  title: string;
  minutes: number;
  priority: number | null;
  dueDate: string | null;
  mandatory: boolean;
  habit: boolean;
  from: Interval;
};

export type Move = { blockId: string; title: string; from: Interval; to: Interval; day: "same" | "later"; reason: string };
export type ReplanResult = {
  kept: { blockId: string; title: string; at: Interval }[];
  moved: Move[];
  dropped: { blockId: string; title: string; reason: string }[];
  /** Work that cannot be placed on time. Reported, never silently dropped. */
  unplaceable: { blockId: string; title: string; mandatory: boolean; reason: string }[];
};

const rank = (i: PlanItem) => [i.mandatory ? 0 : i.habit ? 1 : 2, i.priority || 5, i.dueDate ?? "9999"] as const;

/**
 * Re-flows the movable blocks of a day. `slots` are the free stretches of the rest of the day,
 * including the room the movable blocks occupy now; `later` are the following days' slots.
 * Mandatory work first, then habits, then the rest; blocks stay where they are when they can.
 */
export function replanDay(items: PlanItem[], slots: Slot[], later: Slot[], opts: PlaceOptions): ReplanResult {
  const result: ReplanResult = { kept: [], moved: [], dropped: [], unplaceable: [] };
  let today = slots;
  let next = later;
  const ordered = [...items].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2].localeCompare(rb[2]);
  });

  for (const item of ordered) {
    const stay = item.from.start >= opts.now && today.some((s) => isUsable(s, opts.allowAvoided) && s.start <= item.from.start && s.end >= item.from.end);
    const input = { minutes: item.minutes, priority: item.priority, dueDate: item.dueDate };
    if (stay) {
      const stayPlacement = placeTask(input, today.filter((s) => s.start <= item.from.start && s.end >= item.from.end), { ...opts, notBefore: item.from.start });
      // Late already (past its due date at its current spot) is no reason to move it unless a better place exists.
      const better = stayPlacement?.late ? placeTask(input, today, opts) : null;
      if (!better || better.late) {
        today = consume(today, item.from);
        result.kept.push({ blockId: item.blockId, title: item.title, at: item.from });
        continue;
      }
    }
    const here = placeTask(input, today, opts);
    if (here && (!here.late || !item.mandatory)) {
      today = consume(today, here);
      result.moved.push({ blockId: item.blockId, title: item.title, from: item.from, to: here, day: "same", reason: here.reasons.join(", ") || "meilleur créneau de la journée" });
      continue;
    }
    const after = placeTask(input, next, opts);
    if (after && !(after.late && item.mandatory)) {
      next = consume(next, after);
      result.moved.push({ blockId: item.blockId, title: item.title, from: item.from, to: after, day: "later", reason: item.mandatory ? "plus de place aujourd'hui" : "reporté : pas de place aujourd'hui" });
      continue;
    }
    if (item.mandatory || item.habit) {
      result.unplaceable.push({ blockId: item.blockId, title: item.title, mandatory: item.mandatory, reason: item.mandatory ? "obligatoire mais aucun créneau avant l'échéance" : "aucun créneau libre cette semaine" });
    } else {
      result.dropped.push({ blockId: item.blockId, title: item.title, reason: "aucun créneau libre cette semaine" });
    }
  }
  return result;
}

// ---- Blocks and tasks --------------------------------------------------------

export type BlockStatus = "proposed" | "planned" | "done" | "missed" | "replanned" | "dropped";

/** Where a block stands now. Closed in its source → done; past its end + grace with the task open → missed. */
export function reconcileBlockStatus(
  block: { status: BlockStatus; end: number; taskId: string | null },
  taskState: "open" | "closed" | null,
  now: number,
  graceMin: number,
): BlockStatus {
  if (block.status === "done" || block.status === "dropped" || block.status === "replanned") return block.status;
  if (block.taskId && taskState === "closed") return "done";
  if (now >= block.end + graceMin * MIN) return block.taskId ? "missed" : "done";
  return block.status === "missed" ? "planned" : block.status;
}

const MARKER = /cockpit:task=(\S+)/;
const TICKET = /\b([A-Z]{2,6}-\d+)\b/;

/** A block's task: the `cockpit:task=<id>` marker in the description, else a ticket identifier in the title. */
export function linkedTaskId(description: string | null | undefined, title: string, byIdentifier: Map<string, string>): string | null {
  const marker = description?.match(MARKER)?.[1];
  if (marker) return marker;
  const ticket = title.match(TICKET)?.[1];
  return ticket ? (byIdentifier.get(ticket) ?? null) : null;
}

export function withMarker(description: string | null | undefined, taskId: string): string {
  const rest = (description ?? "").replace(/cockpit:task=\S+\n?/g, "").trimEnd();
  return `${rest ? `${rest}\n` : ""}cockpit:task=${taskId}`;
}
