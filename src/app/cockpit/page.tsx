import { Suspense } from "react";
import { connection } from "next/server";
import { and, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatDayCompact, formatDayMonth, parisDay } from "@/lib/dates";
import { loadContext, upcomingMilestones } from "@/lib/queries";
import { DueLabel, Empty, Meteo, PageHeader, PillarDot, Section } from "@/components/ui";
import { DetailLink } from "@/components/detail-link";
import { DetailPanel } from "@/components/detail-panel";

export default function CockpitPage(props: PageProps<"/cockpit">) {
  return (
    <Suspense fallback={<p className="font-serif italic text-ink-faint">Ouverture du carnet…</p>}>
      <Cockpit {...props} />
    </Suspense>
  );
}

async function Cockpit({ searchParams }: PageProps<"/cockpit">) {
  await connection();
  const sp = await searchParams;
  const today = parisDay();
  const [ctx, milestones, seasons] = await Promise.all([
    loadContext(),
    upcomingMilestones(today, 42),
    db.select().from(schema.seasons).where(and(lte(schema.seasons.startDate, today), gte(schema.seasons.endDate, today))),
  ]);
  const season = seasons[0];

  return (
    <>
      <PageHeader
        eyebrow={season ? `saison · ${season.name}` : "hors saison"}
        title="Cockpit"
        subtitle={season ? `Du ${formatDayMonth(season.startDate)} au ${formatDayMonth(season.endDate)}${season.notes ? ` · ${season.notes}` : ""}` : undefined}
      />

      <div className="grid gap-x-14 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0">
          {ctx.levels.map((level) => {
            const projects = ctx.projects.filter((p) => p.levelId === level.id);
            const over = level.maxProjects != null && projects.length > level.maxProjects;
            return (
              <Section
                key={level.id}
                title={level.name}
                count={projects.length}
                aside={<span className={over ? "text-warn" : undefined}>{over ? `max ${level.maxProjects} · ` : ""}{level.weeklyRule}</span>}
              >
                {projects.length ? (
                  <ul>
                    {projects.map((p) => {
                      const pillar = ctx.pillars.find((x) => x.id === p.pillarId) ?? null;
                      return (
                        <li key={p.id} className="border-b border-rule last:border-b-0">
                          <DetailLink param="p" id={p.id} className="flex items-start gap-3 py-2.5 hover:bg-paper-2/60">
                            <PillarDot pillar={pillar} className="mt-[7px]" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-2">
                                <span className="min-w-0 truncate">{p.name}</span>
                                <span className="leader" aria-hidden />
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
                  <Empty>Aucun projet à ce niveau.</Empty>
                )}
              </Section>
            );
          })}

          {ctx.projects.some((p) => !p.levelId) && (
            <Section title="Sans niveau">
              <Empty>{ctx.projects.filter((p) => !p.levelId).map((p) => p.name).join(" · ")}</Empty>
            </Section>
          )}
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

      <DetailPanel sp={sp} path="/cockpit" />
    </>
  );
}
