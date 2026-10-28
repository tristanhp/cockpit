import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isoWeekday, parisMinutes } from "@/lib/dates";

export type RitualSettings = {
  capWeekday: string;
  capWeekend: string;
  clotureTime: string;
  /** After this the clôture still works but says it is late. */
  hardStop: string;
};

export const DEFAULT_RITUALS: RitualSettings = { capWeekday: "07:30", capWeekend: "09:30", clotureTime: "22:45", hardStop: "23:00" };

export const isHHMM = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

export async function loadRitualSettings(): Promise<RitualSettings> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, "rituals") });
  const saved = (row?.value as Partial<RitualSettings> | undefined) ?? {};
  const pick = <K extends keyof RitualSettings>(k: K) => (isHHMM(saved[k]) ? (saved[k] as string) : DEFAULT_RITUALS[k]);
  return { capWeekday: pick("capWeekday"), capWeekend: pick("capWeekend"), clotureTime: pick("clotureTime"), hardStop: pick("hardStop") };
}

export async function saveRitualSettings(next: RitualSettings): Promise<void> {
  for (const v of Object.values(next)) if (!isHHMM(v)) throw new Error("Heure invalide (hh:mm)");
  if (minutesOf(next.hardStop) <= minutesOf(next.clotureTime)) throw new Error("L'arrêt doit venir après la clôture");
  await db.insert(schema.settings).values({ key: "rituals", value: next }).onConflictDoUpdate({ target: schema.settings.key, set: { value: next } });
}

/** The cap time of a Paris day: weekdays and weekends differ. */
export const capTimeFor = (s: RitualSettings, day: string) => (isoWeekday(day) >= 6 ? s.capWeekend : s.capWeekday);

export const minuteNow = (now: number) => parisMinutes(new Date(now));
