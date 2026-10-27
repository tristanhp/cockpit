import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Block, Source } from "@/db/schema";
import { createCalendarEvent, deleteCalendarEvent, moveCalendarEvent } from "@/connectors/gcal";
import { assertWritableCalendar, withMarker } from "@/engine/planning";
import { parisDay } from "@/lib/dates";
import { isDemo } from "@/sync";
import { writeError } from ".";

// Calendar writes for blocks. Each one checks the calendar's role (travail or perso only)
// and demo mode before any API call: in demo mode only the local events and blocks change.

const iso = (ms: number) => new Date(ms).toISOString();

async function calendar(sourceId: string): Promise<Source> {
  const source = await db.query.sources.findFirst({ where: eq(schema.sources.id, sourceId) });
  if (!source || source.kind !== "gcal") throw new Error("Agenda introuvable");
  assertWritableCalendar(source.config.calendarRole);
  return source;
}

export async function logBlock(blockId: string, action: string, before: unknown, after: unknown, reason: string | null) {
  await db.insert(schema.blockLog).values({ at: new Date().toISOString(), blockId, action, before, after, reason });
}

export type NewBlock = {
  sourceId: string;
  title: string;
  start: number;
  end: number;
  taskId: string | null;
  effort: number | null;
  taskType: string | null;
  estimateMin: number;
  status?: Block["status"];
};

export async function createBlockEvent(n: NewBlock, reason: string): Promise<Block> {
  const source = await calendar(n.sourceId);
  const description = n.taskId ? withMarker(null, n.taskId) : null;
  let externalId = `demo-${crypto.randomUUID().slice(0, 8)}`;
  let url: string | null = null;
  if (!isDemo()) {
    try {
      ({ id: externalId, url } = await createCalendarEvent(source, { title: n.title, start: iso(n.start), end: iso(n.end), description }));
    } catch (e) {
      throw writeError(e);
    }
  }
  const id = `${source.id}:${externalId}`;
  const now = new Date().toISOString();
  await db.insert(schema.events).values({
    id, sourceId: source.id, externalId, url, title: n.title, start: iso(n.start), end: iso(n.end), allDay: false, day: parisDay(iso(n.start)), isExam: false, description, syncedAt: now,
  });
  const block: Block = {
    id, sourceId: source.id, externalId, title: n.title, start: iso(n.start), end: iso(n.end), taskId: n.taskId, status: n.status ?? "planned",
    origin: "cockpit", estimateMin: n.estimateMin, effort: n.effort, taskType: n.taskType, updatedAt: now,
  };
  await db.insert(schema.blocks).values(block);
  await logBlock(id, "create", null, { start: block.start, end: block.end }, reason);
  return block;
}

/** Moves a block's event to a new slot and plans it again. */
export async function moveBlockEvent(block: Block, start: number, end: number, reason: string): Promise<void> {
  const source = await calendar(block.sourceId);
  if (!isDemo()) {
    try {
      await moveCalendarEvent(source, block.externalId, { start: iso(start), end: iso(end) });
    } catch (e) {
      throw writeError(e);
    }
  }
  const now = new Date().toISOString();
  await db.update(schema.events).set({ start: iso(start), end: iso(end), day: parisDay(iso(start)) }).where(eq(schema.events.id, block.id));
  await db.update(schema.blocks).set({ start: iso(start), end: iso(end), status: "planned", estimateMin: Math.round((end - start) / 60000), updatedAt: now }).where(eq(schema.blocks.id, block.id));
  await logBlock(block.id, "move", { start: block.start, end: block.end, status: block.status }, { start: iso(start), end: iso(end) }, reason);
}

/** "Abandonner": the plan is dropped. A Cockpit-made event is deleted; an event someone else made stays in the calendar. */
export async function removeBlock(block: Block, reason: string): Promise<void> {
  const source = await calendar(block.sourceId);
  if (block.origin === "cockpit") {
    if (!isDemo()) {
      try {
        await deleteCalendarEvent(source, block.externalId);
      } catch (e) {
        throw writeError(e);
      }
    }
    await db.delete(schema.events).where(eq(schema.events.id, block.id));
  }
  await db.update(schema.blocks).set({ status: "dropped", updatedAt: new Date().toISOString() }).where(eq(schema.blocks.id, block.id));
  await logBlock(block.id, "drop", { status: block.status }, { status: "dropped" }, reason);
}
