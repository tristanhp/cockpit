import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { formatDayCompact, formatDayMonth, parisDay } from "@/lib/dates";
import { loadContext, upcomingMilestones } from "@/lib/queries";
import { goalsOverview, SEASON_LIMIT, type GoalView } from "@/goals";
import { DueLabel, Empty, Meteo, PageHeader, PillarDot, PriorityBars, Section } from "@/components/ui";
import { DetailLink } from "@/components/detail-link";
import { DetailPanel } from "@/components/detail-panel";
import { ExemptButton, NewGoal, VisionEditor, YearEditor } from "@/components/goal-forms";
import { SignalChip } from "@/components/goal-panel";

export default function ObjectifsPage(props: PageProps<"/objectifs">) {
  return (
    <Suspense fallback={<p className="font-serif italic text-ink-faint">Ouverture du carnet…</p>}>
      <Objectifs {...props} />
    </Suspense>
  );
}

const tab = (active: boolean) => `whitespace-nowrap border-b-2 pb-1 ${active ? "border-accent text-ink" : "border-transparent text-ink-faint hover:text-ink"}`;

async function Objectifs({ searchParams }: PageProps<"/objectifs">) {
  await connection();
  const sp = await searchParams;
  const projets = sp.vue === "projets";
  const today = parisDay();
  const overview = await goalsOverview();
  const { season } = overview;

  return (
    <>
      <PageHeader
        eyebrow={season ? `saison · ${season.name}` : "hors saison"}
        title="Objectifs"
        subtitle={season ? `Du ${formatDayMonth(season.startDate)} au ${formatDayMonth(season.endDate)}${season.notes ? ` · ${season.notes}` : ""}` : undefined}
      />

      <div className="mb-10 flex items-center gap-6 text-sm">
        <Link href="/objectifs" className={tab(!projets)}>Objectifs</Link>
        <Link href="/objectifs?vue=projets" className={tab(projets)}>Projets · {overview.world.projects.length}</Link>
      </div>

      {projets ? <ProjectsTab today={today} withoutGoal={new Set(overview.withoutGoal.map((p) => p.id))} exempt={new Set(overview.exempt.map((p) => p.id))} /> : <GoalsTab overview={overview} />}

      <DetailPanel sp={sp} path="/objectifs" />
    </>
  );
}

// ---- Objectifs ---------------------------------------------------------------------------

function GoalRow({ view }: { view: GoalView }) {
  const { goal } = view;
  return (
    <li className="border-b border-rule last:border-b-0">
      <DetailLink param="g" id={goal.id} className={`block py-3 hover:bg-paper-2/60 ${goal.status === "active" ? "" : "opacity-60"}`}>
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 truncate">{goal.title}</span>
          <span className="leader" aria-hidden />
          {view.signals.map((s) => <SignalChip key={s} signal={s} />)}
          {goal.status !== "active" && <span className="smallcaps text-xs text-ink-faint">{goal.status === "paused" ? "en pause" : "atteint"}</span>}
          {goal.dueDate && <span className="font-mono text-xs text-ink-faint">{formatDayCompact(goal.dueDate)}</span>}
        </span>
        <span className="mt-1.5 flex items-center gap-3">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-rule"><span className="block h-full bg-accent" style={{ width: `${view.progress.pct}%` }} /></span>
          <span className="w-36 shrink-0 text-right font-mono text-xs tabular-nums text-ink-soft">{view.progress.label}</span>
        </span>
        {(view.pillarName || view.parentTitle) && (
          <span className="mt-1 block text-xs text-ink-faint">
            {view.pillarName}
            {view.parentTitle && <span className="font-serif text-sm italic text-ink-soft">{view.pillarName ? " — " : ""}au service de « {view.parentTitle} »</span>}
          </span>
        )}
      </DetailLink>
    </li>
  );
}

function GoalsTab({ overview }: { overview: Awaited<ReturnType<typeof goalsOverview>> }) {
  const { year, season, world } = overview;
  const y = Number(overview.today.slice(0, 4));
  const startsInAutumn = Number(overview.today.slice(5, 7)) >= 9;
  const formProps = {
    yearId: year?.id ?? null,
    seasonId: season?.id ?? null,
    pillars: world.pillars,
    yearGoals: overview.yearGoals.map((g) => ({ id: g.goal.id, title: g.goal.title })),
    canAddSeason: overview.activeSeasonGoals < SEASON_LIMIT,
  };
  return (
    <>
      <Section title="La vision" aside="qui tu deviens">
        <VisionEditor identity={overview.vision.identity} horizon={overview.vision.horizon} rules={overview.vision.rules} />
      </Section>

      <Section title="L'année" aside={year ? `${formatDayMonth(year.startDate)} → ${formatDayMonth(year.endDate)}` : undefined}>
        <YearEditor year={year} suggestStart={`${startsInAutumn ? y : y - 1}-09-01`} suggestEnd={`${startsInAutumn ? y + 1 : y}-08-31`} />
        {year && (overview.yearGoals.length ? <ul className="mt-4">{overview.yearGoals.map((g) => <GoalRow key={g.goal.id} view={g} />)}</ul> : <Empty>Aucun objectif annuel pour l&apos;instant.</Empty>)}
      </Section>

      <Section
        title={season ? `La saison · ${season.name}` : "La saison"}
        count={overview.seasonGoals.length}
        aside={<span className={overview.activeSeasonGoals >= SEASON_LIMIT ? "text-warn" : undefined}>{overview.activeSeasonGoals} actif{overview.activeSeasonGoals > 1 ? "s" : ""} sur {SEASON_LIMIT} max</span>}
      >
        {season ? (
          overview.seasonGoals.length ? <ul>{overview.seasonGoals.map((g) => <GoalRow key={g.goal.id} view={g} />)}</ul> : <Empty>Aucun objectif cette saison.</Empty>
        ) : (
          <Empty>Aucune saison en cours. Les saisons se règlent dans la configuration.</Empty>
        )}
        {overview.activeSeasonGoals >= SEASON_LIMIT && <p className="mb-2 text-xs text-ink-faint">Trois objectifs actifs, c&apos;est le maximum : mets-en un en pause pour en ajouter un autre.</p>}
        <div className="mt-3"><NewGoal {...formProps} /></div>
      </Section>

      {(overview.withoutGoal.length > 0 || overview.orphans.length > 0) && (
        <Section title="Sans fil conducteur" count={overview.withoutGoal.length + overview.orphans.length} aside="à relier, ou à assumer">
          {overview.withoutGoal.length > 0 && (
            <>
              <p className="mt-2 text-sm text-ink-soft">Projets prioritaires qui ne servent aucun objectif. Lie-les à un objectif depuis sa fiche, ou marque-les « hors objectifs » si c&apos;est voulu.</p>
              <ul>
                {overview.withoutGoal.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule py-2.5 last:border-b-0">
                    <DetailLink param="p" id={p.id} className="min-w-0 flex-1 truncate hover:text-accent">{p.name}</DetailLink>
                    <ExemptButton projectId={p.id} exempt={false} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {overview.orphans.length > 0 && (
            <p className="mt-3 text-sm text-ink-soft">
              <span className="smallcaps mr-2 text-xs text-ink-faint">orpheline</span>
              {overview.orphans.length} tâche{overview.orphans.length > 1 ? "s" : ""} sans projet, par exemple « {overview.orphans[0].title} ».{" "}
              <Link href="/taches" className="underline decoration-rule-strong underline-offset-4 hover:decoration-accent">Voir les tâches</Link>
            </p>
          )}
        </Section>
      )}
    </>
  );
}

// ---- Projets (formerly the Cockpit screen) --------------------------------------------------

async function ProjectsTab({ today, withoutGoal, exempt }: { today: string; withoutGoal: Set<string>; exempt: Set<string> }) {
  const [ctx, milestones] = await Promise.all([loadContext(), upcomingMilestones(today, 42)]);
  const maxHaute = ctx.levels.find((l) => l.id === "p1")?.maxProjects ?? null;
  const active = ctx.projects.filter((p) => p.status === "actif");
  const byPriority = (n: number) => active.filter((p) => !p.protected && (p.priority ?? 0) === n);
  const groups = [
    { key: "protege", title: "Habitudes protégées", rule: "jamais sacrifiées", max: null, projects: active.filter((p) => p.protected) },
    { key: "urgent", title: "Urgent", rule: "", max: null, projects: byPriority(1) },
    { key: "haute", title: "Haute", rule: "les priorités qui font avancer la saison", max: maxHaute, projects: byPriority(2) },
    { key: "moyenne", title: "Moyenne", rule: "", max: null, projects: byPriority(3) },
    { key: "basse", title: "Basse", rule: "on garde en vie", max: null, projects: byPriority(4) },
    { key: "aucune", title: "Sans priorité", rule: "", max: null, projects: byPriority(0) },
    { key: "attente", title: "En attente", rule: "rien à faire pour l'instant", max: null, projects: ctx.projects.filter((p) => p.status === "en-attente") },
  ].filter((g) => g.projects.length || ["haute", "moyenne"].includes(g.key));

  return (
    <div className="grid gap-x-14 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0">
        {groups.map((g) => {
          const over = g.max != null && g.projects.length > g.max;
          return (
            <Section key={g.key} title={g.title} count={g.projects.length} aside={<span className={over ? "text-warn" : undefined}>{over ? `max ${g.max} · ` : ""}{g.rule}</span>}>
              {g.projects.length ? (
                <ul>
                  {g.projects.map((p) => {
                    const pillar = ctx.pillars.find((x) => x.id === p.pillarId) ?? null;
                    return (
                      <li key={p.id} className="border-b border-rule last:border-b-0">
                        <DetailLink param="p" id={p.id} className="flex items-start gap-3 py-2.5 hover:bg-paper-2/60">
                          <PillarDot pillar={pillar} className="mt-[7px]" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="min-w-0 truncate">{p.name}</span>
                              <span className="leader" aria-hidden />
                              {withoutGoal.has(p.id) && <span title="Ce projet prioritaire ne sert aucun objectif" className="smallcaps whitespace-nowrap rounded-sm border border-warn px-1.5 text-[11px] leading-4 text-warn">sans objectif</span>}
                              {exempt.has(p.id) && <span className="smallcaps whitespace-nowrap text-[11px] text-ink-faint">hors objectifs</span>}
                              {!p.protected && <PriorityBars priority={p.priority} className="self-center" />}
                              <DueLabel due={p.nextDue} today={today} />
                              <Meteo value={p.meteo} />
                            </div>
                            <div className="mt-0.5 text-xs text-ink-faint">
                              {pillar?.name ?? "Sans pilier"}
                              {p.nextAction && <span className="font-serif text-sm italic text-ink-soft"> — {p.nextAction}</span>}
                            </div>
                          </div>
                        </DetailLink>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty>Aucun projet ici.</Empty>
              )}
            </Section>
          );
        })}
      </div>

      <aside className="min-w-0">
        <Section title="Jalons" count={milestones.length} aside="6 semaines">
          {milestones.length ? (
            <ol className="relative ml-1 border-l border-rule-strong">
              {milestones.map((m) => (
                <li key={m.id} className="relative pb-4 pl-5 last:pb-0">
                  <span className={`absolute -left-[5px] top-1.5 size-[9px] rounded-full border-2 bg-paper ${m.type === "Évaluation" ? "border-margin" : "border-accent"}`} />
                  <span className="block font-mono text-xs tabular-nums text-ink-faint">
                    {m.approximate ? "vers le " : ""}
                    {formatDayCompact(m.startDate!)}
                    {m.endDate && m.endDate !== m.startDate ? ` → ${formatDayCompact(m.endDate)}` : ""}
                  </span>
                  <span className="block text-sm">{m.name}</span>
                  {m.type && <span className="smallcaps text-xs text-ink-faint">{m.type}</span>}
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Aucun jalon dans les 6 semaines.</Empty>
          )}
        </Section>
      </aside>
    </div>
  );
}
