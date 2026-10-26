import type { CalendarEvent, Source } from "@/db/schema";
import { formatDuration, parisDay, parisMinutes } from "@/lib/dates";

type Ev = CalendarEvent & { source: Source };

const HOUR = 44; // px per hour
const MIN_GAP = 60; // free slots shorter than this are not worth showing
const ROLE_COLOR: Record<string, string> = {
  travail: "var(--accent)",
  perso: "var(--pillar-orange)",
  socle: "var(--ok)",
  cours: "var(--pillar-purple)",
  engagement: "var(--ink-soft)",
};

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * The day drawn to scale, like the hour column of a paper planner.
 * Free stretches inside the work window (09:00–22:00) are labelled: that is where blocks will go.
 */
export function Timeline({ events, day }: { events: Ev[]; day: string }) {
  const allDay = events.filter((e) => e.allDay);
  const timed = events
    .filter((e) => !e.allDay)
    .map((e) => {
      const start = e.day < day ? 0 : parisMinutes(e.start);
      const end = parisDay(e.end) > day ? 24 * 60 : Math.max(parisMinutes(e.end), start + 15);
      return { ...e, startMin: start, endMin: end, lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.startMin - b.startMin);

  // Side-by-side lanes for overlapping events.
  let cluster: typeof timed = [];
  let clusterEnd = -1;
  const flush = () => {
    const width = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => (c.lanes = width));
    cluster = [];
  };
  for (const ev of timed) {
    if (ev.startMin >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => c.endMin > ev.startMin).map((c) => c.lane));
    while (used.has(ev.lane)) ev.lane++;
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.endMin);
  }
  flush();

  const from = Math.min(7 * 60, ...timed.map((e) => Math.floor(e.startMin / 60) * 60));
  const to = Math.max(23 * 60, ...timed.map((e) => Math.ceil(e.endMin / 60) * 60));
  const y = (min: number) => ((min - from) / 60) * HOUR;

  // Free slots in the work window.
  const gaps: { start: number; end: number }[] = [];
  let cursor = 9 * 60;
  for (const ev of timed) {
    if (ev.startMin - cursor >= MIN_GAP && cursor < 22 * 60) gaps.push({ start: cursor, end: Math.min(ev.startMin, 22 * 60) });
    cursor = Math.max(cursor, ev.endMin);
  }
  if (22 * 60 - cursor >= MIN_GAP) gaps.push({ start: cursor, end: 22 * 60 });
  const free = gaps.reduce((s, g) => s + g.end - g.start, 0);

  const now = parisDay() === day ? parisMinutes(new Date()) : null;
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60);

  return (
    <div>
      {allDay.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5">
          {allDay.map((e) => (
            <li key={e.id} className="rounded-sm border border-rule px-2 py-0.5 text-xs text-ink-soft">
              {e.title}
            </li>
          ))}
        </ul>
      )}
      <p className="mb-3 text-xs text-ink-faint">
        {timed.length} événement{timed.length > 1 ? "s" : ""} · <span className="text-ink-soft">{formatDuration(free)} libres</span> entre 9 h et 22 h
      </p>
      <div className="relative" style={{ height: y(to) + 8 }}>
        {hours.map((h) => (
          <div key={h} className="absolute inset-x-0 flex items-start gap-2" style={{ top: y(h) }}>
            <span className="-mt-[7px] w-9 shrink-0 font-mono text-[10px] tabular-nums text-ink-faint">{hhmm(h)}</span>
            <span className="h-px flex-1 bg-rule" />
          </div>
        ))}

        {gaps.map((g) => (
          <div
            key={g.start}
            className="absolute right-0 flex items-center justify-center rounded-sm border border-dashed border-rule-strong text-[11px] text-ink-faint"
            style={{ top: y(g.start) + 2, height: y(g.end) - y(g.start) - 4, left: 44 }}
          >
            libre · {formatDuration(g.end - g.start)}
          </div>
        ))}

        {timed.map((e) => {
          const color = e.isExam ? "var(--margin)" : (ROLE_COLOR[e.source.config.calendarRole ?? "engagement"] ?? "var(--ink-soft)");
          const height = Math.max(y(e.endMin) - y(e.startMin) - 2, 18);
          return (
            <a
              key={e.id}
              href={e.url ?? undefined}
              target="_blank"
              rel="noreferrer"
              title={`${hhmm(e.startMin)}–${hhmm(e.endMin)} · ${e.title} · ${e.source.name}`}
              className="absolute overflow-hidden rounded-sm border-l-[3px] px-2 py-0.5 text-xs leading-tight hover:brightness-95"
              style={{
                top: y(e.startMin) + 1,
                height,
                left: `calc(44px + (100% - 44px) * ${e.lane / e.lanes})`,
                width: `calc((100% - 44px) / ${e.lanes} - 2px)`,
                borderColor: color,
                background: `color-mix(in srgb, ${color} 12%, var(--paper))`,
              }}
            >
              <span className="font-medium text-ink">{e.title}</span>
              {height > 30 && <span className="block font-mono text-[10px] text-ink-soft">{hhmm(e.startMin)}–{hhmm(e.endMin)} · {e.source.name}</span>}
            </a>
          );
        })}

        {now !== null && now >= from && now <= to && (
          <div className="pointer-events-none absolute inset-x-0 flex items-center" style={{ top: y(now) }}>
            <span className="w-9 shrink-0 text-right font-mono text-[10px] text-margin">{hhmm(now)}</span>
            <span className="ml-1 size-1.5 rounded-full bg-margin" />
            <span className="h-px flex-1 bg-margin" />
          </div>
        )}
      </div>
    </div>
  );
}
