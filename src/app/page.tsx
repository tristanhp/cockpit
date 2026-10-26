import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { and, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, daysFrom, formatDayLong, formatDayShort, formatRelative, formatTime, parisDay } from "@/lib/dates";
import { eventsForDay, lastSync, loadContext, needsTriage, openTasks, upcomingExams, upcomingMilestones } from "@/lib/queries";
import { Card, Empty, PageHeader, PillarDot, Section, TaskList } from "@/components/ui";
import { SyncButton } from "@/components/sync-button";

export default function TodayPage() {
  return (
    <Suspense fallback={<p className="text-sm text-faint">Chargement…</p>}>
      <Today />
    </Suspense>
  );
}

async function Today() {
  await connection();
  const today = parisDay();
  const [tasks, events, ctx, milestones, exams, synced, seasons] = await Promise.all([
    openTasks(),
    eventsForDay(today),
    loadContext(),
    upcomingMilestones(today, 14),
    upcomingExams(today, 14),
    lastSync(),
    db.select().from(schema.seasons).where(and(lte(schema.seasons.startDate, today), gte(schema.seasons.endDate, today))),
  ]);

  const mine = tasks.filter((t) => !needsTriage(t));
  const late = mine.filter((t) => t.dueDate && t.dueDate < today);
  const soon = mine.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= addDays(today, 1));
  const week = mine.filter((t) => t.dueDate && t.dueDate > addDays(today, 1) && t.dueDate <= addDays(today, 7));
  const triage = tasks.filter(needsTriage);
  const p1 = ctx.projects.filter((p) => p.levelId === "p1");
  const maxP1 = ctx.levels.find((l) => l.id === "p1")?.maxProjects ?? 3;

  const deadlines = [
    ...milestones.map((m) => ({ id: m.id, day: m.startDate!, label: m.name, kind: m.type ?? "Jalon", approx: m.approximate, url: m.url })),
    ...exams.map((e) => ({ id: e.id, day: e.day, label: e.title, kind: "Évaluation (ADE)", approx: false, url: e.url })),
  ].sort((a, b) => a.day.localeCompare(b.day));

  return (
    <>
      <PageHeader title={formatDayLong(today)} subtitle={seasons[0] ? `Saison : ${seasons[0].name}` : undefined}>
        <SyncButton lastSyncLabel={formatRelative(synced)} />
      </PageHeader>

      {!synced && (
        <div className="mb-8">
          <Empty>
            Rien de synchronisé pour l&apos;instant. Renseigne tes accès dans <code>.env.local</code>, connecte Google dans{" "}
            <Link href="/reglages" className="underline">Réglages</Link>, puis clique sur « Synchroniser ».
          </Empty>
        </div>
      )}

      <div className="grid gap-x-10 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          {late.length > 0 && (
            <Section title="En retard" count={late.length}>
              <TaskList tasks={late} today={today} empty="" />
            </Section>
          )}
          <Section title="Aujourd'hui et demain" count={soon.length}>
            <TaskList tasks={soon} today={today} empty="Rien d'échu aujourd'hui ni demain." />
          </Section>
          <Section title="Cette semaine" count={week.length}>
            <TaskList tasks={week} today={today} empty="Aucune échéance dans les 7 prochains jours." />
          </Section>
          {triage.length > 0 && (
            <Section title="Linear · à trier" count={triage.length} aside={<span className="text-xs text-faint">pas assignés à toi : lesquels te concernent ?</span>}>
              <TaskList tasks={triage} today={today} empty="" />
            </Section>
          )}
        </div>

        <aside className="min-w-0">
          <Section title="Agenda" count={events.length}>
            {events.length ? (
              <Card>
                <ul className="divide-y divide-border">
                  {events.map((e) => (
                    <li key={e.id} className="flex gap-3 px-4 py-2 text-sm">
                      <span className="w-12 shrink-0 tabular-nums text-faint">{e.allDay ? "jour" : formatTime(e.start)}</span>
                      <span className={`min-w-0 flex-1 truncate ${e.isExam ? "font-medium text-danger" : ""}`}>{e.title}</span>
                      <span className="shrink-0 text-xs text-faint">{e.source.name}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <Empty>Agenda vide aujourd&apos;hui.</Empty>
            )}
          </Section>

          <Section title="Piliers P1" count={p1.length} aside={p1.length > maxP1 ? <span className="text-xs text-warn">max {maxP1}</span> : undefined}>
            {p1.length ? (
              <Card>
                <ul className="divide-y divide-border">
                  {p1.map((p) => (
                    <li key={p.id} className="px-4 py-2.5">
                      <div className="flex items-center gap-2 text-sm">
                        <PillarDot pillar={ctx.pillars.find((x) => x.id === p.pillarId) ?? null} />
                        <span className="flex-1 truncate">{p.name}</span>
                        <span>{p.meteo}</span>
                      </div>
                      {p.nextAction && <p className="mt-0.5 pl-4 text-xs text-muted">→ {p.nextAction}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <Empty>Aucun projet P1 synchronisé.</Empty>
            )}
          </Section>

          <Section title="Jalons · 14 jours" count={deadlines.length}>
            {deadlines.length ? (
              <Card>
                <ul className="divide-y divide-border">
                  {deadlines.map((d) => (
                    <li key={d.id} className="flex gap-3 px-4 py-2 text-sm">
                      <span className="w-16 shrink-0 text-xs tabular-nums text-faint">
                        {d.approx ? "~" : ""}
                        {daysFrom(today, d.day) === 0 ? "auj." : formatDayShort(d.day)}
                      </span>
                      <a href={d.url ?? undefined} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline" title={d.kind}>
                        {d.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <Empty>Pas de jalon dans les 14 jours.</Empty>
            )}
          </Section>
        </aside>
      </div>
    </>
  );
}
