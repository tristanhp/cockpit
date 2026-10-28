import { addDays, isoWeekday, parisDay, parisMinutes } from "@/lib/dates";

// Which notifications are due right now. Pure: the tick route loads the state, sends what
// this returns, and records each key in `notifications_sent` so nothing goes out twice.

export type NotifyKind = "block-end" | "cloture" | "screens-off" | "cap" | "deadline";

export type NotifySettings = {
  clotureTime: string;
  screensOffTime: string;
  capWeekday: string;
  capWeekend: string;
  /** A scheduled notification still goes out this many minutes late (a missed cron run). */
  catchUpMin: number;
  /** A block-end check-in is still relevant this long after the block ended. */
  blockEndWindowMin: number;
  /** An Urgent or Haute task due within this many days and with no block before its due date. */
  deadlineDays: number;
};

export const DEFAULT_NOTIFY: NotifySettings = {
  clotureTime: "22:45", screensOffTime: "23:00", capWeekday: "07:30", capWeekend: "09:30", catchUpMin: 30, blockEndWindowMin: 60, deadlineDays: 2,
};

export type NotifyState = {
  /** Linked blocks not yet done or dropped. `taskOpen` is false once the task is closed in its source. */
  blocks: { id: string; title: string; endMs: number; taskId: string; taskOpen: boolean }[];
  tasks: { id: string; title: string; priority: number | null; dueDate: string | null; hasBlockBeforeDue: boolean }[];
  sent: Set<string>;
};

export type Notification = { kind: NotifyKind; key: string; title: string; body: string; url: string };

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function dueNotifications(now: number, state: NotifyState, settings: NotifySettings = DEFAULT_NOTIFY): Notification[] {
  const out: Notification[] = [];
  const day = parisDay(new Date(now));
  const minute = parisMinutes(new Date(now));
  const push = (n: Notification) => {
    if (!state.sent.has(n.key)) out.push(n);
  };
  const scheduled = (at: string, window = settings.catchUpMin) => minute >= minutesOf(at) && minute < minutesOf(at) + window;

  for (const b of state.blocks) {
    const since = (now - b.endMs) / 60_000;
    if (b.taskOpen && since >= 0 && since < settings.blockEndWindowMin) {
      push({ kind: "block-end", key: `block-end:${b.id}`, title: "Bloc terminé", body: `« ${b.title} » est fini ? Il reste ouvert dans sa source.`, url: `/?r=${encodeURIComponent(b.id)}` });
    }
  }

  const weekend = isoWeekday(day) >= 6;
  if (scheduled(weekend ? settings.capWeekend : settings.capWeekday)) push({ kind: "cap", key: `cap:${day}`, title: "Le cap du jour", body: "Ta première action et tes trois priorités t'attendent.", url: "/" });
  // The clôture has a hard stop: once screens-off is due, it is too late.
  if (scheduled(settings.clotureTime, Math.min(settings.catchUpMin, minutesOf(settings.screensOffTime) - minutesOf(settings.clotureTime)))) push({ kind: "cloture", key: `cloture:${day}`, title: "La clôture", body: "Trois minutes pour clore la journée et préparer demain.", url: "/cloture" });
  if (scheduled(settings.screensOffTime)) push({ kind: "screens-off", key: `screens-off:${day}`, title: "Écrans éteints", body: "Il est l'heure de poser les écrans.", url: "/" });

  // Daytime only, once a day per task.
  if (minute >= 9 * 60 && minute < 20 * 60) {
    const limit = addDays(day, settings.deadlineDays);
    for (const t of state.tasks) {
      if (t.priority !== 1 && t.priority !== 2) continue;
      if (!t.dueDate || t.dueDate < day || t.dueDate > limit || t.hasBlockBeforeDue) continue;
      push({ kind: "deadline", key: `deadline:${t.id}:${day}`, title: "Échéance en danger", body: `« ${t.title} » est dû bientôt et aucun bloc n'est prévu avant.`, url: `/taches?t=${encodeURIComponent(t.id)}` });
    }
  }
  return out;
}
