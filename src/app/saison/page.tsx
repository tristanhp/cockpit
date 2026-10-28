import { Suspense } from "react";
import { connection } from "next/server";
import { AWARD_LABEL, type AwardKind } from "@/engine/season";
import { formatDayCompact, formatDayMonth } from "@/lib/dates";
import { seasonView } from "@/season";
import { BarChart, Figure, Heatmap, Legend, LineChart } from "@/components/charts";
import { ResultChip } from "@/components/season-ui";
import { Empty, PageHeader, PillarDot, Section } from "@/components/ui";

export default function SeasonPage() {
  return (
    <Suspense fallback={<p className="font-serif italic text-ink-faint">Ouverture du carnet…</p>}>
      <Season />
    </Suspense>
  );
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

async function Season() {
  await connection();
  const v = await seasonView();
  const c = v.charts;
  const tableRows = [{ name: v.season?.name ?? "Saison en cours", t: v.table, current: true }, ...v.past.map((p) => ({ name: p.name, t: p.table, current: false }))];
  const velocityDone = c.velocity.map((w) => w.done);
  const blocks = c.blocksPct.filter((b) => b.pct !== null).map((b) => b.pct as number);
  const sportDone = c.sport.reduce((n, w) => n + w.done, 0);
  const sportPlanned = c.sport.reduce((n, w) => n + w.planned, 0);
  const sleepWeeks = c.sleep.filter((s) => s.bedtimes !== null);

  return (
    <>
      <PageHeader
        eyebrow={v.season ? `saison · ${v.season.name}` : "hors saison"}
        title="La saison"
        subtitle={v.season ? `Du ${formatDayMonth(v.season.startDate)} au ${formatDayMonth(v.season.endDate)} — chaque jour est un match contre le plan du jour` : undefined}
      />

      {v.recap && (
        <Section title={`Le bilan · ${v.recap.seasonName}`} aside="la saison est finie">
          <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {v.recap.awards.map((a) => (
              <li key={a.id} className="border-b border-rule pb-2">
                <p className="smallcaps text-xs text-ink-faint">{AWARD_LABEL[a.kind as AwardKind] ?? a.kind}</p>
                <p className="font-serif text-xl italic">{a.subject}</p>
                <p className="font-mono text-xs text-ink-soft">{a.value}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid gap-x-14 lg:grid-cols-2">
        <div className="min-w-0">
          <Section title="Le classement" aside="points par match, pour comparer des saisons de longueurs différentes">
            {v.table.played || v.past.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[26rem] text-sm">
                  <thead>
                    <tr className="smallcaps text-left text-xs text-ink-faint">
                      <th className="py-1 font-normal">Saison</th><th className="font-normal">J</th><th className="font-normal">V</th><th className="font-normal">N</th><th className="font-normal">D</th><th className="font-normal">BP–BC</th><th className="font-normal">Pts</th><th className="font-normal">/match</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs tabular-nums">
                    {tableRows.map((r) => (
                      <tr key={r.name} className={`border-t border-rule ${r.current ? "text-ink" : "text-ink-soft"}`}>
                        <td className="py-1.5 pr-2 font-sans text-sm">{r.name}</td><td>{r.t.played}</td><td>{r.t.wins}</td><td>{r.t.draws}</td><td>{r.t.losses}</td><td>{r.t.goalsFor}–{r.t.goalsAgainst}</td><td>{r.t.points}</td><td>{r.t.perMatch}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Aucun match joué pour l&apos;instant.</Empty>
            )}
          </Section>

          <Section title="La forme" aside="les cinq derniers matchs">
            {v.form.length ? (
              <div className="flex items-center gap-2 py-2">
                {v.form.map((r, i) => <ResultChip key={i} result={r} />)}
                {v.crisis && <span className="ml-3 text-sm text-margin">Crise : deux défaites de suite.</span>}
              </div>
            ) : (
              <Empty>Pas encore de forme à lire.</Empty>
            )}
            {v.crisis && <p className="text-xs text-ink-faint">Une défaite est sans importance ; deux de suite méritent une question, posée à la prochaine revue.</p>}
          </Section>

          <Section title="La coupe" aside="évaluations et grands jalons, buts doublés">
            {v.cupTies.length ? (
              <ul>
                {v.cupTies.map((t) => (
                  <li key={`${t.day}${t.title}`} className="flex items-baseline gap-3 border-b border-rule py-2 text-sm last:border-b-0">
                    <span className="w-14 shrink-0 font-mono text-xs text-ink-faint">{formatDayCompact(t.day)}</span>
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Aucun match de coupe dans les 30 jours.</Empty>
            )}
          </Section>
        </div>

        <div className="min-w-0">
          <Section title="La carte du joueur" aside="quatre dernières semaines">
            {v.card.pillars.length ? (
              <>
                <p className="flex items-baseline gap-3 py-2">
                  <span className="font-serif text-5xl tabular-nums">{v.card.overall ?? "—"}</span>
                  <span className="text-sm text-ink-soft">général{v.card.overallDelta ? <span className={v.card.overallDelta > 0 ? "text-ok" : "text-margin"}> · {v.card.overallDelta > 0 ? "+" : ""}{v.card.overallDelta} cette semaine</span> : ""}</span>
                </p>
                <ul>
                  {[...v.card.pillars].sort((a, b) => b.rating - a.rating).map((p) => (
                    <li key={p.id} className="flex items-center gap-3 border-b border-rule py-2 text-sm last:border-b-0">
                      <PillarDot pillar={p} />
                      <span className="w-36 shrink-0 truncate">{p.name}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-rule"><span className="block h-full bg-accent" style={{ width: `${p.rating}%` }} /></span>
                      <span className="w-8 text-right font-mono text-sm tabular-nums">{p.rating}</span>
                      <span className={`w-8 text-right font-mono text-xs ${p.delta === null || p.delta === 0 ? "text-ink-faint" : p.delta > 0 ? "text-ok" : "text-margin"}`}>{p.delta === null || p.delta === 0 ? "=" : p.delta > 0 ? `+${p.delta}` : p.delta}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Empty>Pas assez de données pour noter les piliers.</Empty>
            )}
          </Section>

          <Section title="Les derniers matchs" count={Math.min(v.matches.length, 14)}>
            {v.matches.length ? (
              <ul>
                {[...v.matches].reverse().slice(0, 14).map((m) => (
                  <li key={m.day} className="flex items-center gap-3 border-b border-rule py-1.5 text-sm last:border-b-0">
                    <span className="w-14 shrink-0 font-mono text-xs text-ink-faint">{formatDayCompact(m.day)}</span>
                    <ResultChip result={m.result} cup={m.cup} />
                    <span className="font-mono text-xs tabular-nums">{m.goalsFor}–{m.goalsAgainst}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-faint">{m.cup && m.cupTitle ? `coupe · ${m.cupTitle}` : `${Math.round(m.ratio * 100)} % du plan`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Aucun match.</Empty>
            )}
          </Section>
        </div>
      </div>

      <h2 className="mb-4 mt-4 border-b border-ink/80 pb-1 font-serif text-2xl italic">Les courbes</h2>

      <Figure title="Vitesse" summary={`Points d'effort faits par semaine : ${velocityDone.join(", ")}. Médiane des quatre dernières : ${avg(velocityDone.slice(-4))}. Trait pointillé orange : le budget actuel (${c.budget} points).`}>
        <BarChart label="Points d'effort faits par semaine" max={Math.max(c.budget, ...c.velocity.map((w) => Math.max(w.done, w.planned)), 10)} data={c.velocity.map((w) => ({ label: w.weekStart, value: w.done, ghost: w.planned || undefined }))} line={{ value: c.budget, text: `budget ${c.budget}` }} />
      </Figure>

      <Figure title="Blocs tenus" summary={blocks.length ? `Part des blocs tenus par semaine : ${blocks.map((b) => `${b} %`).join(", ")}.` : "Pas encore de blocs mesurés."}>
        <BarChart label="Blocs tenus, en pourcentage" max={100} format={(n) => `${n}`} data={c.blocksPct.map((b) => ({ label: b.weekStart, value: b.pct }))} line={{ value: 60, text: "60 %" }} />
      </Figure>

      {c.habits.length > 0 && (
        <Figure title="Habitudes" summary={c.habits.map((h) => `${h.name} : ${h.weeks.map((w) => (w === null ? "—" : `${w} %`)).join(", ")}`).join(". ") + `. Une case cerclée a atteint l'objectif.`}>
          <Heatmap label="Pourcentage hebdomadaire de chaque habitude" weeks={c.weeks} rows={c.habits} />
        </Figure>
      )}

      {c.goals.length > 0 && (
        <Figure title="Objectifs" summary={c.goals.map((g) => `${g.title} : ${g.points.map((p) => `${p.pct} %`).join(" → ")}`).join(". ")}>
          <LineChart label="Progression de chaque objectif actif" weeks={c.weeks} series={c.goals.map((g) => ({ name: g.title, points: g.points.map((p) => ({ weekStart: p.weekStart, value: p.pct })) }))} />
          <Legend names={c.goals.map((g) => g.title)} />
        </Figure>
      )}

      {sportPlanned > 0 && (
        <Figure title="Sport" summary={`${sportDone} séances faites sur ${sportPlanned} prévues sur huit semaines : ${c.sport.map((w) => `${w.done}/${w.planned}`).join(", ")}.`}>
          <BarChart label="Séances de sport faites par semaine" max={Math.max(...c.sport.map((w) => Math.max(w.done, w.planned)), 3)} data={c.sport.map((w) => ({ label: w.weekStart, value: w.done, ghost: w.planned || undefined }))} />
        </Figure>
      )}

      {sleepWeeks.length > 0 && (
        <Figure title="Sommeil" summary={`Couchers à l'heure sur sept, depuis la revue : ${sleepWeeks.map((s) => s.bedtimes).join(", ")}. Le plancher est à 5.`}>
          <BarChart label="Couchers à l'heure par semaine" max={7} data={c.sleep.map((s) => ({ label: s.weekStart, value: s.bedtimes }))} line={{ value: 5, text: "5 / 7" }} />
        </Figure>
      )}
    </>
  );
}
