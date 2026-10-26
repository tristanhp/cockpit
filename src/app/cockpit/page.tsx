import { Suspense } from "react";
import { connection } from "next/server";
import { and, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatDayShort, parisDay } from "@/lib/dates";
import { loadContext, upcomingMilestones } from "@/lib/queries";
import { Card, DueLabel, Empty, METEO_LABEL, PageHeader, PillarDot, Section } from "@/components/ui";

export default function CockpitPage() {
  return (
    <Suspense fallback={<p className="text-sm text-faint">Chargement…</p>}>
      <Cockpit />
    </Suspense>
  );
}

async function Cockpit() {
  await connection();
  const today = parisDay();
  const [ctx, milestones, seasons] = await Promise.all([
    loadContext(),
    upcomingMilestones(today, 42),
    db.select().from(schema.seasons).where(and(lte(schema.seasons.startDate, today), gte(schema.seasons.endDate, today))),
  ]);

  return (
    <>
      <PageHeader title="Cockpit" subtitle={seasons[0] ? `Saison en cours : ${seasons[0].name}` : "Aucune saison définie"} />

      {ctx.levels.map((level) => {
        const projects = ctx.projects.filter((p) => p.levelId === level.id);
        const over = level.maxProjects != null && projects.length > level.maxProjects;
        return (
          <Section
            key={level.id}
            title={level.name}
            count={projects.length}
            aside={<span className={`text-xs ${over ? "text-warn" : "text-faint"}`}>{over ? `max ${level.maxProjects} · ` : ""}{level.weeklyRule}</span>}
          >
            {projects.length ? (
              <Card>
                <ul className="divide-y divide-border">
                  {projects.map((p) => {
                    const pillar = ctx.pillars.find((x) => x.id === p.pillarId) ?? null;
                    return (
                      <li key={p.id} className="flex items-start gap-3 px-4 py-2.5">
                        <span className="pt-1.5"><PillarDot pillar={pillar} /></span>
                        <div className="min-w-0 flex-1">
                          <a href={p.url ?? undefined} target="_blank" rel="noreferrer" className="text-sm hover:underline">{p.name}</a>
                          <div className="text-xs text-faint">{pillar?.name ?? "Sans pilier"}</div>
                          {p.nextAction && <p className="mt-0.5 text-xs text-muted">→ {p.nextAction}</p>}
                        </div>
                        <DueLabel due={p.nextDue} today={today} />
                        <span title={p.meteo ? METEO_LABEL[p.meteo] : undefined}>{p.meteo}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
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

      <Section title="Jalons · 6 semaines" count={milestones.length}>
        {milestones.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {milestones.map((m) => (
                <li key={m.id} className="flex gap-3 px-4 py-2 text-sm">
                  <span className="w-24 shrink-0 text-xs tabular-nums text-faint">
                    {m.approximate ? "~" : ""}
                    {formatDayShort(m.startDate!)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="shrink-0 text-xs text-faint">{m.type}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Empty>Aucun jalon dans les 6 semaines.</Empty>
        )}
      </Section>
    </>
  );
}
