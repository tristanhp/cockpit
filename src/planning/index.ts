import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Block, Task } from "@/db/schema";
import {
  DEFAULT_SETTINGS, MIN, durationFor, freeSlots, isMandatory, kindOfRole, learnMinutesPerPoint, linkedTaskId, placeSplit, placeTask, reconcileBlockStatus, replanDay, canWriteCalendar,
  type BusyEvent, type PlanItem, type PlanningSettings, type Placement, type ReplanResult, type Slot, type TaskType,
} from "@/engine/planning";
import { addDays, isoWeekday, nowMs, parisDay, parisInstant } from "@/lib/dates";
import { fold } from "@/lib/text";
import { createBlockEvent, logBlock, moveBlockEvent, removeBlock } from "@/writeback/blocks";

export const DEFAULT_TYPE = "default";

export async function loadSettings(): Promise<PlanningSettings> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, "planning") });
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<PlanningSettings>) ?? {}) };
}

const typeId = (name: string | null | undefined) => fold(name ?? DEFAULT_TYPE).trim() || DEFAULT_TYPE;

async function typeRow(name: string | null | undefined): Promise<TaskType & { id: string; name: string }> {
  const id = typeId(name);
  const row = await db.query.taskTypes.findFirst({ where: eq(schema.taskTypes.id, id) });
  return row ?? { id, name: name ?? DEFAULT_TYPE, minutesPerPoint: null, samples: 0 };
}

/** The user's answer to "how many minutes per point for this type?", asked once per new type. */
export async function setTypeRate(name: string, minutesPerPoint: number): Promise<void> {
  if (!Number.isFinite(minutesPerPoint) || minutesPerPoint < 5 || minutesPerPoint > 480) throw new Error("Entre un nombre de minutes entre 5 et 480");
  const id = typeId(name);
  await db.insert(schema.taskTypes).values({ id, name, minutesPerPoint: Math.round(minutesPerPoint), samples: 0 }).onConflictDoUpdate({ target: schema.taskTypes.id, set: { minutesPerPoint: Math.round(minutesPerPoint) } });
}

/** Every timed event the planner must work around, by the role of its calendar. */
async function busyEvents(fromDay: string, toDay: string, exclude: Set<string> = new Set()): Promise<BusyEvent[]> {
  const [rows, sources] = await Promise.all([
    db.select().from(schema.events).where(and(gte(schema.events.day, addDays(fromDay, -1)), lte(schema.events.day, addDays(toDay, 1)))),
    db.select().from(schema.sources).where(eq(schema.sources.enabled, true)),
  ]);
  const role = new Map(sources.map((s) => [s.id, s.config.calendarRole]));
  const dropped = new Set((await db.select({ id: schema.blocks.id }).from(schema.blocks).where(eq(schema.blocks.status, "dropped"))).map((b) => b.id));
  return rows
    .filter((e) => !e.allDay && role.has(e.sourceId) && !exclude.has(e.id) && !dropped.has(e.id))
    .map((e) => ({ id: e.id, start: Date.parse(e.start), end: Date.parse(e.end), kind: kindOfRole(role.get(e.sourceId)) }));
}

const daysFrom = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

type TaskInfo = { task: Task; minutes: number; type: string; graded: boolean };

async function taskInfo(taskId: string, settings: PlanningSettings): Promise<TaskInfo | null> {
  const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) });
  if (!task) return null;
  const source = await db.query.sources.findFirst({ where: eq(schema.sources.id, task.sourceId) });
  const type = await typeRow(task.taskType);
  return { task, minutes: durationFor(task, type, settings), type: task.taskType ?? DEFAULT_TYPE, graded: Boolean(source?.config.graded) };
}

/** The calendar new blocks go to: a travail calendar first, else perso. */
async function blockCalendar(): Promise<string> {
  const sources = await db.select().from(schema.sources).where(and(eq(schema.sources.kind, "gcal"), eq(schema.sources.enabled, true)));
  const pick = sources.find((s) => s.config.calendarRole === "travail") ?? sources.find((s) => s.config.calendarRole === "perso");
  if (!pick) throw new Error("Aucun agenda « travail » ou « perso » pour y poser des blocs");
  return pick.id;
}

const clampNow = (now: number) => Math.ceil(now / (15 * MIN)) * 15 * MIN;

export type Option = { key: "auto" | "tonight" | "tomorrow" | "split" | "drop"; label: string; placements: Placement[]; note?: string };

/** The replan sheet's choices with their concrete slots; an option with no placement cannot be picked. */
export async function replanOptions(blockId: string, now = nowMs()): Promise<{ block: Block; task: Task | null; options: Option[] } | null> {
  const block = await db.query.blocks.findFirst({ where: eq(schema.blocks.id, blockId) });
  if (!block) return null;
  const settings = await loadSettings();
  const info = block.taskId ? await taskInfo(block.taskId, settings) : null;
  const minutes = Math.max(15, Math.round((Date.parse(block.end) - Date.parse(block.start)) / MIN));
  const input = { minutes, priority: info?.task.priority ?? 3, dueDate: info?.task.dueDate ?? null };
  const today = parisDay(new Date(now));
  const events = await busyEvents(today, addDays(today, 8), new Set([block.id]));
  const slots = freeSlots(events, daysFrom(today, 8), settings);
  const neighbours = (await db.select().from(schema.blocks).where(ne(schema.blocks.status, "dropped"))).filter((b) => b.id !== block.id).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
  const base = { now: clampNow(now), neighbours };
  const tomorrow = addDays(today, 1);
  const eveningFrom = Math.max(base.now, parisInstant(today, 18 * 60));

  const one = (p: Placement | null) => (p ? [p] : []);
  return {
    block,
    task: info?.task ?? null,
    options: [
      { key: "auto", label: "Laisser Cockpit choisir", placements: one(placeTask(input, slots, base)), note: "le meilleur créneau cette semaine" },
      { key: "tonight", label: "Ce soir", placements: one(placeTask(input, slots, { ...base, notBefore: eveningFrom, notAfter: parisInstant(today, settings.endMin) })) },
      { key: "tomorrow", label: "Demain matin", placements: one(placeTask(input, slots, { ...base, notBefore: parisInstant(tomorrow, settings.startMin), notAfter: parisInstant(tomorrow, 13 * 60) })) },
      { key: "split", label: "Découper en deux", placements: placeSplit(input, slots, base) ?? [], note: `deux blocs de ${Math.max(30, Math.ceil(minutes / 2 / 15) * 15)} min` },
      { key: "drop", label: "Abandonner", placements: [], note: "le bloc disparaît du plan, la tâche reste ouverte" },
    ],
  };
}

export async function applyReplanOption(blockId: string, key: Option["key"]): Promise<void> {
  const found = await replanOptions(blockId);
  if (!found) throw new Error("Bloc introuvable");
  const { block, options } = found;
  const option = options.find((o) => o.key === key);
  if (!option) throw new Error("Option inconnue");
  if (key === "drop") return removeBlock(block, "Abandonné depuis À replacer");
  if (!option.placements.length) throw new Error("Aucun créneau disponible pour cette option");
  const [first, second] = option.placements;
  await moveBlockEvent(block, first.start, first.end, `Replacé : ${option.label}`);
  if (second) {
    await createBlockEvent(
      { sourceId: block.sourceId, title: block.title, start: second.start, end: second.end, taskId: block.taskId, effort: block.effort, taskType: block.taskType, estimateMin: Math.round((second.end - second.start) / MIN) },
      "Seconde moitié d'un bloc découpé",
    );
  }
}

export type LeftoverChoice = "tomorrow" | "later" | "drop";

/** Best slot for a block's task from `fromDay` on, optionally no later than the end of `untilDay`. */
async function placeFrom(block: Block, fromDay: string, untilDay: string | null, now: number): Promise<Placement | null> {
  const settings = await loadSettings();
  const info = block.taskId ? await taskInfo(block.taskId, settings) : null;
  const minutes = Math.max(15, Math.round((Date.parse(block.end) - Date.parse(block.start)) / MIN));
  const today = parisDay(new Date(now));
  const events = await busyEvents(today, addDays(today, 8), new Set([block.id]));
  const slots = freeSlots(events, daysFrom(today, 8), settings);
  const neighbours = (await db.select().from(schema.blocks).where(ne(schema.blocks.status, "dropped"))).filter((b) => b.id !== block.id).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
  return placeTask({ minutes, priority: info?.task.priority ?? 3, dueDate: info?.task.dueDate ?? null }, slots, {
    now: clampNow(now), neighbours, notBefore: parisInstant(fromDay, settings.startMin), notAfter: untilDay ? parisInstant(untilDay, settings.endMin) : undefined,
  });
}

/** The clôture's "Restes" for a missed block: tomorrow, later this week (Cockpit chooses) or dropped. */
export async function applyLeftover(blockId: string, choice: LeftoverChoice, now = nowMs()): Promise<void> {
  if (choice === "drop") return applyReplanOption(blockId, "drop");
  const block = await db.query.blocks.findFirst({ where: eq(schema.blocks.id, blockId) });
  if (!block) throw new Error("Bloc introuvable");
  const today = parisDay(new Date(now));
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7 - isoWeekday(today));
  const placement =
    choice === "tomorrow"
      ? await placeFrom(block, tomorrow, null, now)
      : ((await placeFrom(block, addDays(today, 2), weekEnd, now)) ?? (await placeFrom(block, tomorrow, null, now)));
  if (!placement) throw new Error("Aucun créneau libre cette semaine");
  await moveBlockEvent(block, placement.start, placement.end, choice === "tomorrow" ? "Clôture : demain" : "Clôture : plus tard cette semaine");
}

/** C'est parti: brings a planned block forward so that it starts now (rounded down to five minutes), keeping its length. */
export async function moveBlockToNow(blockId: string, now = nowMs()): Promise<void> {
  const block = await db.query.blocks.findFirst({ where: eq(schema.blocks.id, blockId) });
  if (!block) throw new Error("Bloc introuvable");
  const start = Math.floor(now / (5 * MIN)) * 5 * MIN;
  const length = Date.parse(block.end) - Date.parse(block.start);
  const events = await busyEvents(parisDay(new Date(now)), parisDay(new Date(now)), new Set([block.id]));
  if (events.some((e) => e.kind === "protected" && e.start < start + length && e.end > start)) throw new Error("un événement protégé occupe ce créneau");
  await moveBlockEvent(block, start, start + length, "C'est parti : le bloc commence maintenant");
}

/** The day to move a late task without a block to: tomorrow, or the day of the best slot from the day after. */
export async function dayForLater(taskId: string, today: string, now = nowMs()): Promise<string> {
  const settings = await loadSettings();
  const info = await taskInfo(taskId, settings);
  const fallback = addDays(today, 2);
  if (!info) return fallback;
  const events = await busyEvents(today, addDays(today, 8));
  const p = placeTask({ minutes: info.minutes, priority: info.task.priority, dueDate: null }, freeSlots(events, daysFrom(today, 8), settings), { now: clampNow(now), notBefore: parisInstant(fallback, settings.startMin) });
  return p ? parisDay(new Date(p.start)) : fallback;
}

/** Puts a task on the calendar: the best slot, or the one the user typed (Paris local "YYYY-MM-DDTHH:mm"). */
export async function scheduleTask(taskId: string, manualStart?: string, now = nowMs()): Promise<Block> {
  const settings = await loadSettings();
  const info = await taskInfo(taskId, settings);
  if (!info) throw new Error("Tâche introuvable");
  const today = parisDay(new Date(now));
  const events = await busyEvents(today, addDays(today, 8));
  let start: number;
  if (manualStart) {
    const m = manualStart.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
    if (!m) throw new Error("Date et heure invalides");
    start = parisInstant(m[1], Number(m[2]) * 60 + Number(m[3]));
    const end = start + info.minutes * MIN;
    const clash = events.find((e) => e.kind === "protected" && e.start < end && e.end > start);
    if (clash) throw new Error("Ce créneau chevauche un événement protégé (cours, sport)");
  } else {
    const slots = freeSlots(events, daysFrom(today, 8), settings);
    const p = placeTask({ minutes: info.minutes, priority: info.task.priority, dueDate: info.task.dueDate }, slots, { now: clampNow(now) });
    if (!p) throw new Error("Aucun créneau libre cette semaine");
    start = p.start;
  }
  return createBlockEvent(
    {
      sourceId: await blockCalendar(), title: info.task.identifier ? `${info.task.identifier} ${info.task.title}` : info.task.title, start, end: start + info.minutes * MIN,
      taskId, effort: info.task.effort, taskType: info.type, estimateMin: info.minutes,
    },
    manualStart ? "Créneau choisi à la main" : "Laissé à Cockpit",
  );
}

// ---- Replan the day ---------------------------------------------------------

export type DayPlan = { day: string; before: PlanItem[]; result: ReplanResult };

export async function proposeDayReplan(day = parisDay(), now = nowMs()): Promise<DayPlan> {
  const settings = await loadSettings();
  const all = await db.select().from(schema.blocks).where(inArray(schema.blocks.status, ["planned", "proposed", "missed"]));
  const dayBlocks = all.filter((b) => parisDay(b.start) === day && b.taskId);
  // A block in progress stays put; the movable ones are those not started yet, or missed.
  const movable = dayBlocks.filter((b) => b.status === "missed" || Date.parse(b.start) >= now);
  const items: PlanItem[] = [];
  for (const b of movable) {
    const info = await taskInfo(b.taskId!, settings);
    if (!info) continue;
    items.push({
      blockId: b.id,
      title: b.title,
      minutes: Math.max(15, Math.round((Date.parse(b.end) - Date.parse(b.start)) / MIN)),
      priority: info.task.priority,
      dueDate: info.task.dueDate,
      mandatory: isMandatory({ priority: info.task.priority, dueDate: info.task.dueDate, graded: info.graded }, day),
      habit: fold(info.type) === "habitude",
      from: { start: Date.parse(b.start), end: Date.parse(b.end) },
    });
  }
  const events = await busyEvents(day, addDays(day, 6), new Set(items.map((i) => i.blockId)));
  const rest = freeSlots(events, [day], settings).map((s): Slot => ({ ...s, start: Math.max(s.start, clampNow(now)) })).filter((s) => s.end > s.start);
  const later = freeSlots(events, daysFrom(addDays(day, 1), 6), settings);
  return { day, before: items, result: replanDay(items, rest, later, { now: clampNow(now) }) };
}

export async function applyDayReplan(day = parisDay()): Promise<{ moved: number; dropped: number }> {
  const plan = await proposeDayReplan(day);
  let moved = 0;
  let dropped = 0;
  for (const m of plan.result.moved) {
    const block = await db.query.blocks.findFirst({ where: eq(schema.blocks.id, m.blockId) });
    if (block) {
      await moveBlockEvent(block, m.to.start, m.to.end, `Replanification de la journée : ${m.reason}`);
      moved++;
    }
  }
  for (const d of plan.result.dropped) {
    const block = await db.query.blocks.findFirst({ where: eq(schema.blocks.id, d.blockId) });
    if (block) {
      await removeBlock(block, `Replanification de la journée : ${d.reason}`);
      dropped++;
    }
  }
  return { moved, dropped };
}

// ---- Sync: calendar events → blocks ----------------------------------------

/**
 * Every event on a travail or perso calendar is a block. A block moved by hand in Google
 * Calendar is respected: its times follow the event and Cockpit never moves it back.
 * Then each block is reconciled against its task, and learning runs for blocks that ended done.
 */
export async function reconcileBlocks(now = nowMs()): Promise<void> {
  const settings = await loadSettings();
  const sources = (await db.select().from(schema.sources).where(eq(schema.sources.enabled, true))).filter((s) => s.kind === "gcal" && canWriteCalendar(s.config.calendarRole));
  if (!sources.length) return;
  const ids = sources.map((s) => s.id);
  const [events, existing, tasks, taskSources] = await Promise.all([
    db.select().from(schema.events).where(inArray(schema.events.sourceId, ids)),
    db.select().from(schema.blocks),
    db.select().from(schema.tasks),
    db.select().from(schema.sources),
  ]);
  const byId = new Map(existing.map((b) => [b.id, b]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const byIdentifier = new Map(tasks.flatMap((t) => (t.identifier ? [[t.identifier, t.id] as const] : [])));
  const stamp = new Date(now).toISOString();
  const eventIds = new Set(events.map((e) => e.id));

  for (const e of events.filter((x) => !x.allDay)) {
    const prev = byId.get(e.id);
    const taskId = prev?.taskId ?? linkedTaskId(e.description, e.title, byIdentifier);
    const t = taskId ? taskById.get(taskId) : undefined;
    const row = {
      title: e.title, start: e.start, end: e.end, taskId,
      effort: t?.effort ?? prev?.effort ?? null, taskType: t ? (t.taskType ?? DEFAULT_TYPE) : (prev?.taskType ?? null),
      estimateMin: Math.round((Date.parse(e.end) - Date.parse(e.start)) / MIN), updatedAt: stamp,
    };
    if (prev) {
      if (prev.start !== e.start || prev.end !== e.end) await logBlock(prev.id, "moved-by-hand", { start: prev.start, end: prev.end }, { start: e.start, end: e.end }, "Déplacé dans Google Agenda");
      await db.update(schema.blocks).set(row).where(eq(schema.blocks.id, e.id));
    } else {
      await db.insert(schema.blocks).values({ id: e.id, sourceId: e.sourceId, externalId: e.externalId, status: "planned", origin: "calendar", ...row });
    }
  }
  // An event deleted in the calendar takes its block out of the plan.
  for (const b of existing) if (ids.includes(b.sourceId) && !eventIds.has(b.id) && !["done", "dropped"].includes(b.status)) {
    await db.update(schema.blocks).set({ status: "dropped", updatedAt: stamp }).where(eq(schema.blocks.id, b.id));
    await logBlock(b.id, "drop", { status: b.status }, { status: "dropped" }, "Supprimé dans Google Agenda");
  }

  const sourceOk = new Map(taskSources.map((s) => [s.id, s.enabled && !s.lastSyncError && Boolean(s.lastSyncAt)]));
  const fresh = await db.select().from(schema.blocks).where(inArray(schema.blocks.status, ["planned", "proposed", "missed"]));
  for (const b of fresh) {
    let state: "open" | "closed" | null = null;
    if (b.taskId) {
      const t = taskById.get(b.taskId);
      const src = b.taskId.slice(0, b.taskId.indexOf(":"));
      state = t ? (t.status === "done" ? "closed" : "open") : sourceOk.get(src) ? "closed" : null;
    }
    const next = reconcileBlockStatus({ status: b.status, end: Date.parse(b.end), taskId: b.taskId }, state, now, settings.graceMin);
    if (next === b.status) continue;
    await db.update(schema.blocks).set({ status: next, updatedAt: stamp }).where(eq(schema.blocks.id, b.id));
    await logBlock(b.id, "status", { status: b.status }, { status: next }, state === "closed" ? "Tâche terminée dans sa source" : "Bloc terminé");
    if (next === "done" && b.taskId && state === "closed") await learn(b);
  }
}

async function learn(b: Block): Promise<void> {
  const minutes = Math.round((Date.parse(b.end) - Date.parse(b.start)) / MIN);
  const type = await typeRow(b.taskType);
  const next = learnMinutesPerPoint(type, minutes, b.effort);
  if (next === type) return;
  await db.insert(schema.taskTypes).values({ id: type.id, name: type.name, ...next }).onConflictDoUpdate({ target: schema.taskTypes.id, set: next });
}

// ---- Reads for the screens --------------------------------------------------

export type BlockView = Block & { task: Task | null; typeName: string | null };

async function views(rows: Block[]): Promise<BlockView[]> {
  const tasks = rows.some((b) => b.taskId) ? await db.select().from(schema.tasks) : [];
  return rows.map((b) => ({ ...b, task: tasks.find((t) => t.id === b.taskId) ?? null, typeName: b.taskType }));
}

export async function missedBlocks(): Promise<BlockView[]> {
  return views((await db.select().from(schema.blocks).where(eq(schema.blocks.status, "missed"))).sort((a, b) => a.start.localeCompare(b.start)));
}

export async function nowAndNext(now = nowMs()): Promise<{ current: BlockView | null; next: BlockView | null; minutesLeft: number }> {
  const live = (await db.select().from(schema.blocks).where(inArray(schema.blocks.status, ["planned", "proposed"]))).sort((a, b) => a.start.localeCompare(b.start));
  const current = live.find((b) => Date.parse(b.start) <= now && now < Date.parse(b.end)) ?? null;
  const next = live.find((b) => Date.parse(b.start) > now && b.id !== current?.id) ?? null;
  const [c, n] = await views([current, next].filter((x): x is Block => Boolean(x)));
  return {
    current: current ? c : null,
    next: next ? (current ? n : c) : null,
    minutesLeft: current ? Math.max(0, Math.round((Date.parse(current.end) - now) / MIN)) : 0,
  };
}

export async function blocksBetween(fromDay: string, toDay: string): Promise<BlockView[]> {
  const rows = (await db.select().from(schema.blocks)).filter((b) => b.status !== "dropped" && parisDay(b.start) >= fromDay && parisDay(b.start) <= toDay);
  return views(rows.sort((a, b) => a.start.localeCompare(b.start)));
}

/** A task type with no learned rate yet and a block planned: the one question the strip may ask. */
export async function typeToAsk(block: BlockView | null): Promise<string | null> {
  if (!block?.typeName || fold(block.typeName) === DEFAULT_TYPE) return null;
  const t = await typeRow(block.typeName);
  return t.minutesPerPoint == null ? block.typeName : null;
}
