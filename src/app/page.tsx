import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { and, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, daysFrom, formatDayCompact, formatDayMonth, formatRelative, isoWeek, parisDay, weekdayName } from "@/lib/dates";
import { eventsForDay, lastSync, loadContext, needsTriage, openTasks, upcomingExams, upcomingMilestones } from "@/lib/queries";
import { Empty, Meteo, PageHeader, PillarDot, Section, TaskList } from "@/components/ui";
import { SyncButton } from "@/components/sync-button";
import { Timeline } from "@/components/timeline";
import { DetailLink } from "@/components/detail-link";
import { DetailPanel } from "@/components/detail-panel";

export default function TodayPage(props: PageProps<"/">) {
  return (
    <Suspense fallback={<p className="font-serif italic text-ink-faint">Ouverture du carnet…</p>}>
      <Today {...props} />
    </Suspense>
  );
}

async function Today({ searchParams }: PageProps<"/">) {
  await connection();
  const sp = await searchParams;
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
  const urgent = mine.filter((t) => t.dueDate && t.dueDate <= addDays(today, 1));
  const week = mine.filter((t) => t.dueDate && t.dueDate > addDays(today, 1) && t.dueDate <= addDays(today, 7));
  // Linear tickets not assigned to you: only the ones due soon belong on today's page.
  const allTriage = tasks.filter(needsTriage);
  const triage = allTriage.filter((t) => t.dueDate && t.dueDate <= addDays(today, 14));
  const p1 = ctx.projects.filter((p) => p.status === "actif" && !p.protected && p.priority === 2);
  const maxP1 = ctx.levels.find((l) => l.id === "p1")?.maxProjects ?? 3;

  const horizon = [
    ...milestones.map((m) => ({ id: m.id, day: m.startDate!, label: m.name, kind: m.type ?? "Jalon", approx: m.approximate, url: m.url })),
    ...exams.map((e) => ({ id: e.id, day: e.day, label: e.title, kind: "Évaluation", approx: false, url: e.url })),
  ].sort((a, b) => a.day.localeCompare(b.day));

  return (
    <>
      <PageHeader
        eyebrow={weekdayName(today)}
        title={formatDayMonth(today)}
        subtitle={<>— {seasons[0]?.name ?? "Hors saison"}, semaine {isoWeek(today)} —</>}
      >
        <SyncButton lastSyncLabel={formatRelative(synced)} />
      </PageHeader>

      {!synced && (
        <div className="mb-10 border-l-2 border-margin pl-4 text-sm text-ink-soft">
          Rien de synchronisé pour l&apos;instant. Renseigne tes accès dans <code className="font-mono text-xs">.env.local</code>, connecte Google dans{" "}
          <Link href="/reglages" className="underline decoration-rule-strong underline-offset-4">Réglages</Link>, puis clique sur « Synchroniser ».
        </div>
      )}

      <div className="grid gap-x-14 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          <Section title="Ce qui presse" count={urgent.length} aside="en retard, aujourd'hui, demain">
            <TaskList tasks={urgent} today={today} empty="Rien d'échu d'ici demain. Respire." />
          </Section>
          <Section title="Cette semaine" count={week.length}>
            <TaskList tasks={week} today={today} empty="Aucune échéance dans les 7 prochains jours." />
          </Section>
          {triage.length > 0 && (
            <Section
              title="À trier"
              count={triage.length}
              aside={
                <Link href="/taches?trier=1" className="hover:text-ink">
                  Linear, dus sous 14 jours · voir les {allTriage.length}
                </Link>
              }
            >
              <TaskList tasks={triage} today={today} empty="" />
            </Section>
          )}
        </div>

        <aside className="min-w-0">
          <Section title="La journée">
            {events.length ? <Timeline events={events} day={today} /> : <Empty>Page blanche : aucun événement aujourd&apos;hui.</Empty>}
          </Section>

          <Section title="Les piliers" count={p1.length} aside={p1.length > maxP1 ? <span className="text-warn">Haute · max {maxP1}</span> : "Haute"}>
            {p1.length ? (
              <ul>
                {p1.map((p) => (
                  <li key={p.id} className="border-b border-rule last:border-b-0">
                    <DetailLink param="p" id={p.id} className="block py-2.5 hover:bg-paper-2/60">
                      <span className="flex items-center gap-2">
                        <PillarDot pillar={ctx.pillars.find((x) => x.id === p.pillarId) ?? null} />
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        <Meteo value={p.meteo} />
                      </span>
                      {p.nextAction && <span className="mt-0.5 block pl-4 font-serif text-sm italic text-ink-soft">→ {p.nextAction}</span>}
                    </DetailLink>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Aucun projet de priorité haute pour l&apos;instant.</Empty>
            )}
          </Section>

          <Section title="À l'horizon" count={horizon.length} aside="14 jours">
            {horizon.length ? (
              <ul>
                {horizon.map((h) => (
                  <li key={h.id} className="flex items-baseline gap-3 border-b border-rule py-2 text-sm last:border-b-0">
                    <span className="w-14 shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-ink-faint">
                      {h.approx ? "~" : ""}
                      {daysFrom(today, h.day) === 0 ? "auj." : formatDayCompact(h.day)}
                    </span>
                    <a href={h.url ?? undefined} target="_blank" rel="noreferrer" title={h.kind} className={`min-w-0 flex-1 ${h.kind === "Évaluation" ? "text-margin" : ""}`}>
                      {h.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Rien à l&apos;horizon des deux semaines.</Empty>
            )}
          </Section>
        </aside>
      </div>

      <DetailPanel sp={sp} path="/" />
    </>
  );
}
