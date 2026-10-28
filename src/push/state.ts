import { gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_NOTIFY, type NotifySettings, type NotifyState } from "@/engine/notifications";
import { addDays, parisDay } from "@/lib/dates";
import { loadRitualSettings } from "@/rituals/settings";
import { loadReviewSettings } from "@/review";

/** Reads the database into what `dueNotifications` needs. */
export async function loadNotifyState(now: number): Promise<NotifyState> {
  const day = parisDay(new Date(now));
  const [blocks, tasks, sent] = await Promise.all([
    db.select().from(schema.blocks).where(inArray(schema.blocks.status, ["planned", "proposed", "missed"])),
    db.select().from(schema.tasks),
    db.select({ key: schema.notificationsSent.key }).from(schema.notificationsSent).where(gte(schema.notificationsSent.sentAt, new Date(now - 2 * 86_400_000).toISOString())),
  ]);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  return {
    blocks: blocks.flatMap((b) => {
      if (!b.taskId) return [];
      const t = taskById.get(b.taskId);
      return [{ id: b.id, title: b.title, endMs: Date.parse(b.end), taskId: b.taskId, taskOpen: Boolean(t && t.status !== "done") }];
    }),
    tasks: tasks
      .filter((t) => t.status !== "done" && (t.priority === 1 || t.priority === 2) && t.dueDate && t.dueDate >= day && t.dueDate <= addDays(day, 14))
      .map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        dueDate: t.dueDate,
        hasBlockBeforeDue: blocks.some((b) => b.taskId === t.id && parisDay(b.start) <= t.dueDate!),
      })),
    sent: new Set(sent.map((s) => s.key)),
  };
}

/** The cap, clôture and hard-stop times come from the ritual settings; the rest from "notifications". */
export async function loadNotifySettings(): Promise<NotifySettings> {
  const [row, rituals, review] = await Promise.all([db.query.settings.findFirst({ where: (s, { eq }) => eq(s.key, "notifications") }), loadRitualSettings(), loadReviewSettings()]);
  return {
    ...DEFAULT_NOTIFY,
    ...((row?.value as Partial<NotifySettings>) ?? {}),
    capWeekday: rituals.capWeekday,
    capWeekend: rituals.capWeekend,
    clotureTime: rituals.clotureTime,
    screensOffTime: rituals.hardStop,
    reviewDay: review.day,
    reviewTime: review.time,
  };
}

export const recordSent = (n: { key: string; kind: string }) =>
  db.insert(schema.notificationsSent).values({ key: n.key, kind: n.kind, sentAt: new Date().toISOString() }).onConflictDoNothing();

