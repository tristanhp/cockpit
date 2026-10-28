import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { and, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, daysFrom, formatDayCompact, formatDayMonth, formatRelative, isoWeek, isoWeekday, nowMs, parisDay, parisMinutes, weekdayName } from "@/lib/dates";
import { eventsForDay, lastSync, loadContext, needsTriage, openTasks, upcomingExams, upcomingMilestones } from "@/lib/queries";
import { Empty, Meteo, PageHeader, PillarDot, Section, TaskList } from "@/components/ui";
import { SyncButton } from "@/components/sync-button";
import { Timeline } from "@/components/timeline";
import { DetailLink } from "@/components/detail-link";
import { DetailPanel } from "@/components/detail-panel";
import { MissedCard, NowStrip } from "@/components/blocks";
import { DayReplanSheet, ReplanSheet } from "@/components/replan-sheet";
import { Cap } from "@/components/cap";
import { goalsOverview } from "@/goals";
import { currentWeekLoad, loadReviewSettings } from "@/review";
import { needsAttention } from "@/engine/goals";
import { SignalChip } from "@/components/goal-panel";
import { loadRitualSettings, minutesOf } from "@/rituals/settings";

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
  const [tasks, events, ctx, milestones, exams, synced, seasons, rituals, goals, weekLoad, reviewSettings] = await Promise.all([
    openTasks(),
    eventsForDay(today),
    loadContext(),
    upcomingMilestones(today, 14),
    upcomingExams(today, 14),
    lastSync(),
    db.select().from(schema.seasons).where(and(lte(schema.seasons.startDate, today), gte(schema.seasons.endDate, today))),
    loadRitualSettings(),
    goalsOverview(),
    currentWeekLoad(),
    loadReviewSettings(),
  ]);
  const reviewDue = isoWeekday(today) === reviewSettings.day && parisMinutes(new Date(nowMs())) >= minutesOf(reviewSettings.time);
  const stuck = [...goals.seasonGoals, ...goals.yearGoals].filter((g) => needsAttention(g.signals));
  // The clôture button shows from a quarter of an hour before its time.
  const clotureSoon = parisMinutes(new Date(nowMs())) >= minutesOf(rituals.clotureTime) - 15;

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
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/?replan=1" scroll={false} className="rounded-md border border-rule-strong px-3 py-1.5 text-sm hover:border-accent hover:text-accent">
            Replanifier ma journée
          </Link>
          {reviewDue && (
            <Link href="/revue" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90">
              Faire la revue
            </Link>
          )}
          {clotureSoon && (
            <Link href="/cloture" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90">
              Faire la clôture
            </Link>
          )}
          <SyncButton lastSyncLabel={formatRelative(synced)} />
        </div>
      </PageHeader>

      {weekLoad.load.over && (
        <p className="mb-6 border-l-2 border-warn pl-4 text-sm text-ink-soft">
          {weekLoad.load.message} <Link href="/semaine" className="underline decoration-rule-strong underline-offset-4 hover:decoration-accent">Voir la semaine</Link>
        </p>
      )}
      <Cap />
      <NowStrip />

      {!synced && (
        <div className="mb-10 border-l-2 border-margin pl-4 text-sm text-ink-soft">
          Rien de synchronisé pour l&apos;instant. Renseigne tes accès dans <code className="font-mono text-xs">.env.local</code>, connecte Google dans{" "}
          <Link href="/reglages" className="underline decoration-rule-strong underline-offset-4">Réglages</Link>, puis clique sur « Synchroniser ».
        </div>
      )}

      <div className="grid gap-x-14 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          <MissedCard />
          <Section title="Ce qui presse" count={urgent.length} aside="en retard, aujourd'hui, demain">
            <TaskList tasks={urgent} today={today} empty="Rien d'échu d'ici demain. Respire." />
          </Section>
          <Section title="Cette semaine" count={week.length}>
            <TaskList tasks={week} today={today} empty="Aucune échéance dans les 7 prochains jours." />
          </Section>
          {(stuck.length > 0 || goals.withoutGoal.length > 0) && (
            <Section title="Objectifs" count={stuck.length + goals.withoutGoal.length} aside={<Link href="/objectifs" className="hover:text-ink">tout voir</Link>}>
              <ul>
                {stuck.map((g) => (
                  <li key={g.goal.id} className="border-b border-rule last:border-b-0">
                    <DetailLink param="g" id={g.goal.id} className="flex items-baseline gap-2 py-2.5 hover:bg-paper-2/60">
                      <span className="min-w-0 flex-1 truncate">{g.goal.title}</span>
                      {g.signals.filter((s) => s !== "sur-le-fil").map((s) => <SignalChip key={s} signal={s} />)}
                    </DetailLink>
                  </li>
                ))}
                {goals.withoutGoal.length > 0 && (
                  <li className="py-2.5 text-sm text-ink-soft">
                    {goals.withoutGoal.length} projet{goals.withoutGoal.length > 1 ? "s" : ""} prioritaire{goals.withoutGoal.length > 1 ? "s" : ""} sans objectif.{" "}
                    <Link href="/objectifs" className="underline decoration-rule-strong underline-offset-4 hover:decoration-accent">Relier</Link>
                  </li>
                )}
              </ul>
            </Section>
          )}
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
      {typeof sp.r === "string" && <ReplanSheet blockId={sp.r} />}
      {sp.replan === "1" && <DayReplanSheet />}
    </>
  );
}
