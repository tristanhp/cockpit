// All "day" logic is anchored to Europe/Paris, whatever the server's timezone.
export const TZ = "Europe/Paris";

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD in Paris time. Accepts a Date or an ISO string; a bare date string is returned as is. */
export function parisDay(d: Date | string = new Date()): string {
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return dayFmt.format(typeof d === "string" ? new Date(d) : d);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

export function formatDayLong(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function formatDayShort(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "jamais";
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "à l'instant";
  if (diff < 60) return `il y a ${diff} min`;
  if (diff < 1440) return `il y a ${Math.round(diff / 60)} h`;
  return `il y a ${Math.round(diff / 1440)} j`;
}

/** Days between today and `day` (negative = in the past). */
export function daysFrom(today: string, day: string): number {
  return Math.round((Date.parse(day) - Date.parse(today)) / 86400000);
}

/** ISO 8601 week number. */
export function isoWeek(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86400000 + 1) / 7);
}

export function weekdayName(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDayMonth(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "31 oct." — compact enough never to wrap. */
export function formatDayCompact(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

const minuteParts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Minutes since midnight in Paris time. */
export function parisMinutes(iso: string | Date): number {
  const parts = minuteParts.formatToParts(typeof iso === "string" ? new Date(iso) : iso);
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return h * 60 + m;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`) : `${m} min`;
}

const wallFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Paris offset from UTC at an instant, in minutes (60 in winter, 120 in summer). */
export function parisOffsetMin(ts: number): number {
  const p = Object.fromEntries(wallFmt.formatToParts(new Date(ts)).map((x) => [x.type, Number(x.value)]));
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - ts) / 60000);
}

/** The instant (epoch ms) at `minutes` after midnight on a Paris day. */
export function parisInstant(day: string, minutes: number): number {
  const [y, m, d] = day.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  let t = wall - 60 * 60000;
  t = wall - parisOffsetMin(t) * 60000;
  return wall - parisOffsetMin(t) * 60000;
}

/** ISO weekday of a day string: 1 Monday … 7 Sunday. */
export function isoWeekday(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}
