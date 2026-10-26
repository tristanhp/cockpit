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
