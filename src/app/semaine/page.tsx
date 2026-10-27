import { Suspense } from "react";
import { connection } from "next/server";
import { addDays, formatDayLong, formatTime, isoWeekday, parisDay } from "@/lib/dates";
import { blocksBetween } from "@/planning";
import { Empty, PageHeader, Section } from "@/components/ui";

export default function WeekPage() {
  return (
    <Suspense fallback={<p className="font-serif italic text-ink-faint">Ouverture du carnet…</p>}>
      <Week />
    </Suspense>
  );
}

const STATUS: Record<string, string> = { proposed: "proposé", planned: "prévu", done: "fait", missed: "à replacer", replanned: "replacé", dropped: "abandonné" };

async function Week() {
  await connection();
  const today = parisDay();
  const monday = addDays(today, 1 - isoWeekday(today));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const blocks = await blocksBetween(days[0], days[6]);
  return (
    <>
      <PageHeader eyebrow="les blocs de la semaine" title="Semaine" subtitle={`${blocks.length} bloc${blocks.length > 1 ? "s" : ""}, lecture seule`} />
      {days.map((day) => {
        const list = blocks.filter((b) => parisDay(b.start) === day);
        return (
          <Section key={day} title={formatDayLong(day)} count={list.length} aside={day === today ? "aujourd'hui" : undefined}>
            {list.length ? (
              <ul>
                {list.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-baseline gap-x-3 border-b border-rule py-2 text-sm last:border-b-0">
                    <span className="w-24 shrink-0 font-mono text-xs tabular-nums text-ink-faint">{formatTime(b.start)}–{formatTime(b.end)}</span>
                    <span className="min-w-0 flex-1 truncate">{b.title}</span>
                    <span className={`text-xs ${b.status === "missed" ? "text-margin" : "text-ink-faint"}`}>{STATUS[b.status]}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{isoWeekday(day) === 7 ? "Dimanche : jamais de blocs." : "Aucun bloc."}</Empty>
            )}
          </Section>
        );
      })}
    </>
  );
}
