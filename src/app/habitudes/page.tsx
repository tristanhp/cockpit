import { Suspense } from "react";
import { connection } from "next/server";
import { formatDayMonth, weekdayName } from "@/lib/dates";
import { habitWeeks } from "@/rituals";
import { Empty, PageHeader, Section } from "@/components/ui";

export default function HabitsPage() {
  return (
    <Suspense fallback={<p className="font-serif italic text-ink-faint">Ouverture du carnet…</p>}>
      <Habits />
    </Suspense>
  );
}

const LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

async function Habits() {
  await connection();
  const { today, habits } = await habitWeeks();
  return (
    <>
      <PageHeader eyebrow={weekdayName(today)} title="Habitudes" subtitle={`Semaine en cours · ${formatDayMonth(today)} · 80 % fait une semaine pleine`} />
      <Section title="Cette semaine" count={habits.length} aside="cochées à la clôture">
        {habits.length ? (
          <ul>
            {habits.map((h) => (
              <li key={h.id} className="border-b border-rule py-3 last:border-b-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                  <span className="min-w-0 flex-1">
                    {h.name}
                    {h.protected && <span className="smallcaps ml-2 text-xs text-ink-faint">protégée</span>}
                  </span>
                  <ol className="flex gap-1.5" aria-label="Les sept jours">
                    {h.days.map((d, i) => (
                      <li
                        key={d.day}
                        title={d.day}
                        className={`flex size-6 items-center justify-center rounded-full border text-[11px] ${
                          d.done ? "border-accent bg-accent text-paper" : d.day > today ? "border-rule text-ink-faint" : "border-rule-strong text-ink-faint"
                        } ${d.day === today ? "ring-1 ring-ink-faint ring-offset-1 ring-offset-paper" : ""}`}
                      >
                        {LETTERS[i]}
                      </li>
                    ))}
                  </ol>
                  <span className={`w-24 text-right font-mono text-xs tabular-nums ${h.pct >= h.targetPct ? "text-ink" : "text-ink-soft"}`}>
                    {h.pct} % <span className="text-ink-faint">/ {h.targetPct}</span>
                  </span>
                </div>
                {h.twoMisses && <p className="mt-1.5 text-xs text-ink-faint">Deux semaines sous l&apos;objectif : jamais deux fois de suite. Cette semaine, on la remet.</p>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Aucune habitude pour l&apos;instant. Ajoute-les dans le fichier de configuration.</Empty>
        )}
      </Section>
    </>
  );
}
