import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Award, Match } from "@/db/schema";
import { isMandatory } from "@/engine/planning";
import { computeAwards, DEFAULT_SEASON, form, isCrisis, overallRating, pillarRating, pillarWeight, scoreDay, table, type DayItem, type MatchResult, type Played, type PillarInputs, type SeasonSettings, type TableRow } from "@/engine/season";
import { weeklyPct } from "@/engine/cloture";
import { addDays, nowMs, parisDay } from "@/lib/dates";
import { goalsOverview } from "@/goals";
import { reviewView, weekStartOf } from "@/review";

// La saison: each day is a match against that day's plan. Scored silently, revealed in the Sunday revue and on
// /saison. The rules are pure (`src/engine/season.ts`); this file derives matches, ratings and awards from the database.

export async function loadSeasonSettings(): Promise<SeasonSettings> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, "season") });
  const saved = (row?.value as Partial<SeasonSettings> | undefined) ?? {};
  const ratio = (v: unknown, fallback: number) => (typeof v === "number" && v > 0 && v <= 1 ? v : fallback);
  const winAt = ratio(saved.winAt, DEFAULT_SEASON.winAt);
  const drawAt = ratio(saved.drawAt, DEFAULT_SEASON.drawAt);
  return {
    winAt,
    drawAt: drawAt < winAt ? drawAt : DEFAULT_SEASON.drawAt,
    cupTypes: Array.isArray(saved.cupTypes) ? saved.cupTypes.map(String).filter(Boolean) : DEFAULT_SEASON.cupTypes,
    showDaily: saved.showDaily === true,
  };
}

export async function saveSeasonSettings(next: SeasonSettings): Promise<void> {
  const ok = (n: number) => Number.isFinite(n) && n > 0 && n <= 1;
  if (!ok(next.winAt) || !ok(next.drawAt)) throw new Error("Les seuils doivent être entre 1 % et 100 %");
  if (next.drawAt >= next.winAt) throw new Error("Le seuil du match nul doit être sous celui de la victoire");
  const value: SeasonSettings = { ...next, cupTypes: next.cupTypes.map((t) => t.trim()).filter(Boolean) };
  await db.insert(schema.settings).values({ key: "season", value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

// ---- Matches ------------------------------------------------------------------------------------------

async function itemsFor(day: string, now: number): Promise<{ items: DayItem[]; cup: { title: string } | null }> {
  const settings = await loadSeasonSettings();
  const [blocks, tasks, sources, plan, exams, milestones] = await Promise.all([
    db.select().from(schema.blocks),
    db.select().from(schema.tasks),
    db.select().from(schema.sources),
    db.query.dayPlans.findFirst({ where: eq(schema.dayPlans.day, day) }),
    db.select().from(schema.events).where(and(eq(schema.events.day, day), eq(schema.events.isExam, true))),
    db.select().from(schema.milestones).where(eq(schema.milestones.startDate, day)),
  ]);
  const graded = new Set(sources.filter((s) => s.config.graded).map((s) => s.id));
  const items: DayItem[] = [];
  for (const b of blocks) {
    if (parisDay(b.start) !== day || b.status === "dropped") continue;
    // A block that has not ended yet is neither kept nor missed.
    if (b.status !== "done" && Date.parse(b.end) > now) continue;
    const task = tasks.find((t) => t.id === b.taskId);
    items.push({
      kind: "block", effort: b.effort ?? 0, done: b.status === "done",
      mandatory: Boolean(task && isMandatory({ priority: task.priority, dueDate: task.dueDate, graded: graded.has(task.sourceId) }, day)),
    });
  }
  // The two rituals only count on a day that had anything to do, so an empty day is not a match.
  const cap = Boolean(plan?.startedAt);
  const cloture = Boolean(plan?.closedAt);
  if (items.length || cap || cloture) items.push({ kind: "ritual", effort: 0, done: cap, mandatory: false }, { kind: "ritual", effort: 0, done: cloture, mandatory: false });
  const cupMilestone = milestones.find((m) => m.type && settings.cupTypes.includes(m.type));
  const title = exams[0]?.title ?? cupMilestone?.name ?? null;
  return { items, cup: title ? { title } : null };
}

/** Derives the match of a day and stores it (or removes it when nothing was planned). Returns the result. */
export async function recordMatch(day: string, now = nowMs()): Promise<Match | null> {
  const [{ items, cup }, settings, seasons] = await Promise.all([itemsFor(day, now), loadSeasonSettings(), db.select().from(schema.seasons)]);
  const score = scoreDay(items, cup, settings);
  if (!score) {
    await db.delete(schema.matches).where(eq(schema.matches.day, day));
    return null;
  }
  const row = { ...score, seasonId: seasons.find((s) => s.startDate <= day && day <= s.endDate)?.id ?? null, computedAt: new Date(now).toISOString() };
  await db.insert(schema.matches).values({ day, ...row }).onConflictDoUpdate({ target: schema.matches.day, set: row });
  return (await db.query.matches.findFirst({ where: eq(schema.matches.day, day) })) ?? null;
}

const played = (m: Match): Played => ({ day: m.day, result: m.result, goalsFor: m.goalsFor, goalsAgainst: m.goalsAgainst, cup: m.cup });

// ---- Ratings and goal snapshots --------------------------------------------------------------------------

type PillarCtx = { id: string; name: string; color: string; weight: number; inputs: PillarInputs };

/** The four weeks ending with the week of `weekStart`, per pillar. Goal progress comes from `goalPct`. */
async function pillarInputs(weekStart: string, goalPct: (goalId: string) => number | null, now: number): Promise<PillarCtx[]> {
  const from = addDays(weekStart, -21);
  const to = addDays(weekStart, 6);
  const [pillars, projects, tasks, blocks, goals, links, habits, logs] = await Promise.all([
    db.select().from(schema.pillars),
    db.select().from(schema.projects),
    db.select().from(schema.tasks),
    db.select().from(schema.blocks),
    db.select().from(schema.goals),
    db.select().from(schema.goalLinks),
    db.select().from(schema.habits),
    db.select().from(schema.habitLogs).where(and(gte(schema.habitLogs.day, from), lte(schema.habitLogs.day, to))),
  ]);
  const pillarOf = (taskId: string | null) => {
    const task = tasks.find((t) => t.id === taskId);
    return projects.find((p) => p.id === task?.projectId)?.pillarId ?? null;
  };
  const windowBlocks = blocks.filter((b) => b.taskId && b.status !== "dropped" && parisDay(b.start) >= from && parisDay(b.start) <= to && (b.status === "done" || Date.parse(b.end) <= now));
  const weeks = [0, 7, 14, 21].map((d) => addDays(weekStart, -d));

  return pillars.filter((p) => !p.archived).map((p) => {
    const mine = windowBlocks.filter((b) => pillarOf(b.taskId) === p.id);
    const myGoals = goals.filter((g) => g.pillarId === p.id && g.status === "active");
    const habitIds = new Set(links.filter((l) => l.kind === "habit" && myGoals.some((g) => g.id === l.goalId)).map((l) => l.refId));
    const habitRatios = habits.filter((h) => habitIds.has(h.id)).flatMap((h) => {
      const own = logs.filter((l) => l.habitId === h.id);
      const perWeek = weeks.filter((w) => own.some((l) => l.day >= w && l.day <= addDays(w, 6))).map((w) => Math.min(1, weeklyPct(own, w, addDays(w, 6)) / h.targetPct));
      return perWeek.length ? [perWeek.reduce((a, b) => a + b, 0) / perWeek.length] : [];
    });
    return {
      id: p.id, name: p.name, color: p.color,
      weight: pillarWeight(projects.filter((x) => x.pillarId === p.id && x.status === "actif").map((x) => x.priority)),
      inputs: {
        effortDone: mine.filter((b) => b.status === "done").reduce((n, b) => n + (b.effort ?? 0), 0),
        effortPlanned: mine.reduce((n, b) => n + (b.effort ?? 0), 0),
        blocksKept: mine.filter((b) => b.status === "done").length,
        blocksPlanned: mine.length,
        habitRatios,
        goalPcts: myGoals.map((g) => goalPct(g.id)).filter((x): x is number => x !== null),
      },
    };
  });
}

/** Ratings of this week and last week (the player card shows the change), and this week's goal progress. */
async function refreshRatings(now: number): Promise<void> {
  const week = weekStartOf(parisDay(new Date(now)));
  const overview = await goalsOverview(now);
  const current = new Map([...overview.seasonGoals, ...overview.yearGoals].map((g) => [g.goal.id, g.progress.pct]));
  for (const [goalId, pct] of current) {
    await db.insert(schema.goalSnapshots).values({ goalId, weekStart: week, pct }).onConflictDoUpdate({ target: [schema.goalSnapshots.goalId, schema.goalSnapshots.weekStart], set: { pct } });
  }
  const snapshots = await db.select().from(schema.goalSnapshots);
  for (const ws of [week, addDays(week, -7)]) {
    const pct = (id: string) => (ws === week ? (current.get(id) ?? null) : (snapshots.find((s) => s.goalId === id && s.weekStart === ws)?.pct ?? current.get(id) ?? null));
    for (const p of await pillarInputs(ws, pct, now)) {
      const rating = pillarRating(p.inputs);
      if (rating === null) continue;
      await db.insert(schema.ratings).values({ pillarId: p.id, weekStart: ws, rating }).onConflictDoUpdate({ target: [schema.ratings.pillarId, schema.ratings.weekStart], set: { rating } });
    }
  }
}

// ---- The table and the awards -----------------------------------------------------------------------------

async function refreshTable(): Promise<void> {
  const rows = await db.select().from(schema.matches);
  const bySeason = new Map<string, Match[]>();
  for (const m of rows) if (m.seasonId) bySeason.set(m.seasonId, [...(bySeason.get(m.seasonId) ?? []), m]);
  for (const [seasonId, ms] of bySeason) {
    const t = table(ms);
    const row = { played: t.played, points: t.points, wins: t.wins, draws: t.draws, losses: t.losses, goalsFor: t.goalsFor, goalsAgainst: t.goalsAgainst };
    await db.insert(schema.seasonTable).values({ seasonId, ...row }).onConflictDoUpdate({ target: schema.seasonTable.seasonId, set: row });
  }
}

/** When a season's end date has passed, writes its recap once. */
async function generateAwards(today: string): Promise<void> {
  const [seasons, existing, rows] = await Promise.all([db.select().from(schema.seasons), db.select().from(schema.awards), db.select().from(schema.matches)]);
  for (const season of seasons.filter((s) => s.endDate < today && !existing.some((a) => a.seasonId === s.id))) {
    const matches = rows.filter((m) => m.seasonId === season.id);
    if (!matches.length) continue;
    const [pillars, ratingRows, blocks, tasks, projects] = await Promise.all([
      db.select().from(schema.pillars), db.select().from(schema.ratings), db.select().from(schema.blocks), db.select().from(schema.tasks), db.select().from(schema.projects),
    ]);
    const lastWeek = ratingRows.filter((r) => r.weekStart <= season.endDate).map((r) => r.weekStart).sort().pop();
    const points = new Map<string, number>();
    for (const b of blocks) {
      if (b.status !== "done" || parisDay(b.start) < season.startDate || parisDay(b.start) > season.endDate) continue;
      const project = projects.find((p) => p.id === tasks.find((t) => t.id === b.taskId)?.projectId);
      if (project) points.set(project.name, (points.get(project.name) ?? 0) + (b.effort ?? 0));
    }
    const docs = computeAwards({
      matches: matches.map(played),
      pillarRatings: pillars.map((p) => ({ name: p.name, rating: ratingRows.find((r) => r.pillarId === p.id && r.weekStart === lastWeek)?.rating ?? null })),
      projectPoints: [...points].map(([name, pts]) => ({ name, points: pts })),
    });
    if (docs.length) await db.insert(schema.awards).values(docs.map((d) => ({ id: `award-${season.id}-${d.kind}`, seasonId: season.id, ...d, createdAt: new Date().toISOString() }))).onConflictDoNothing();
  }
}

/**
 * The pass run by every sync and tick: re-derives the matches of the last three days (a day with no clôture counts
 * with what was done and a ritual miss), then the table, the ratings, the goal snapshots and any season-end recap.
 */
export async function refreshSeason(now = nowMs()): Promise<void> {
  const today = parisDay(new Date(now));
  for (let i = 1; i <= 3; i++) await recordMatch(addDays(today, -i), now);
  await refreshTable();
  await refreshRatings(now);
  await generateAwards(today);
}

// ---- Views --------------------------------------------------------------------------------------------------------

export type Fixture = { day: string; match: Pick<Match, "result" | "goalsFor" | "goalsAgainst" | "cup" | "cupTitle" | "ratio"> | null };
export type CardPillar = { id: string; name: string; color: string; rating: number; delta: number | null; weight: number };

export type SeasonView = {
  today: string;
  season: { id: string; name: string; startDate: string; endDate: string } | null;
  settings: SeasonSettings;
  matches: Match[];
  form: MatchResult[];
  crisis: boolean;
  table: TableRow;
  past: { name: string; table: TableRow }[];
  cupTies: { day: string; title: string }[];
  card: { pillars: CardPillar[]; overall: number | null; overallDelta: number | null };
  recap: { seasonName: string; awards: Award[] } | null;
  fixtures: Fixture[];
  charts: {
    weeks: string[];
    velocity: { weekStart: string; done: number; planned: number }[];
    budget: number;
    blocksPct: { weekStart: string; pct: number | null }[];
    sport: { weekStart: string; done: number; planned: number }[];
    sleep: { weekStart: string; bedtimes: number | null }[];
    habits: { name: string; target: number; weeks: (number | null)[] }[];
    goals: { title: string; points: { weekStart: string; pct: number }[] }[];
  };
};

async function currentBudget(now: number): Promise<number> {
  const view = await reviewView(now, { create: false });
  return view.budget.budget;
}

export async function seasonView(now = nowMs()): Promise<SeasonView> {
  const today = parisDay(new Date(now));
  const week = weekStartOf(today);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(week, -7 * (7 - i)));
  const [settings, seasons, matchRows, tables, awardRows, pillars, ratingRows, projects, metrics, reviews, habits, logs, goals, snapshots, milestones, exams] = await Promise.all([
    loadSeasonSettings(),
    db.select().from(schema.seasons),
    db.select().from(schema.matches),
    db.select().from(schema.seasonTable),
    db.select().from(schema.awards),
    db.select().from(schema.pillars),
    db.select().from(schema.ratings),
    db.select().from(schema.projects),
    db.select().from(schema.weeklyMetrics),
    db.select().from(schema.reviews),
    db.select().from(schema.habits).where(eq(schema.habits.active, true)),
    db.select().from(schema.habitLogs).where(gte(schema.habitLogs.day, weeks[0])),
    db.select().from(schema.goals),
    db.select().from(schema.goalSnapshots),
    db.select().from(schema.milestones).where(and(gte(schema.milestones.startDate, today), lte(schema.milestones.startDate, addDays(today, 30)))),
    db.select().from(schema.events).where(and(eq(schema.events.isExam, true), gte(schema.events.day, today), lte(schema.events.day, addDays(today, 30)))),
  ]);
  const season = seasons.find((s) => s.startDate <= today && today <= s.endDate) ?? null;
  const matches = matchRows.filter((m) => season && m.seasonId === season.id).sort((a, b) => a.day.localeCompare(b.day));
  const past = seasons
    .filter((s) => s.id !== season?.id)
    .flatMap((s) => {
      const t = tables.find((x) => x.seasonId === s.id);
      return t && t.played ? [{ name: s.name, end: s.endDate, table: { ...t, perMatch: Math.round((t.points / t.played) * 100) / 100 } as TableRow }] : [];
    })
    .sort((a, b) => b.end.localeCompare(a.end))
    .map(({ name, table: t }) => ({ name, table: t }));

  const rating = (pillarId: string, ws: string) => ratingRows.find((r) => r.pillarId === pillarId && r.weekStart === ws)?.rating ?? null;
  const weightOf = (pillarId: string) => pillarWeight(projects.filter((p) => p.pillarId === pillarId && p.status === "actif").map((p) => p.priority));
  const card: CardPillar[] = pillars
    .filter((p) => !p.archived && rating(p.id, week) !== null)
    .map((p) => ({ id: p.id, name: p.name, color: p.color, rating: rating(p.id, week)!, delta: rating(p.id, addDays(week, -7)) === null ? null : rating(p.id, week)! - rating(p.id, addDays(week, -7))!, weight: weightOf(p.id) }));
  const overall = overallRating(card.map((p) => ({ rating: p.rating, weight: p.weight })));
  const previous = overallRating(pillars.filter((p) => rating(p.id, addDays(week, -7)) !== null).map((p) => ({ rating: rating(p.id, addDays(week, -7)), weight: weightOf(p.id) })));

  const ended = seasons.filter((s) => s.endDate < today && awardRows.some((a) => a.seasonId === s.id)).sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  const m = (ws: string) => metrics.find((x) => x.weekStart === ws);
  const review = (ws: string) => reviews.find((r) => r.weekStart === ws);
  const budget = await currentBudget(now);

  return {
    today,
    season: season ? { id: season.id, name: season.name, startDate: season.startDate, endDate: season.endDate } : null,
    settings,
    matches,
    form: form(matches.map(played)),
    crisis: isCrisis(matches.map(played)),
    table: table(matches),
    past,
    cupTies: [...exams.map((e) => ({ day: e.day, title: e.title })), ...milestones.filter((x) => x.type && settings.cupTypes.includes(x.type) && x.startDate).map((x) => ({ day: x.startDate!, title: x.name }))].sort((a, b) => a.day.localeCompare(b.day)),
    card: { pillars: card, overall, overallDelta: overall !== null && previous !== null ? overall - previous : null },
    recap: ended ? { seasonName: ended.name, awards: awardRows.filter((a) => a.seasonId === ended.id) } : null,
    fixtures: [],
    charts: {
      weeks,
      velocity: weeks.map((ws) => ({ weekStart: ws, done: m(ws)?.pointsDone ?? 0, planned: m(ws)?.pointsPlanned ?? 0 })),
      budget,
      blocksPct: weeks.map((ws) => ({ weekStart: ws, pct: m(ws)?.blocksPlanned ? Math.round((m(ws)!.blocksKept / m(ws)!.blocksPlanned) * 100) : null })),
      sport: weeks.map((ws) => ({ weekStart: ws, done: m(ws)?.sportDone ?? 0, planned: m(ws)?.sportPlanned ?? 0 })),
      sleep: weeks.map((ws) => ({ weekStart: ws, bedtimes: review(ws)?.data.numbers?.bedtimesOnTarget ?? null })),
      habits: habits.map((h) => {
        const own = logs.filter((l) => l.habitId === h.id);
        return { name: h.name, target: h.targetPct, weeks: weeks.map((ws) => (own.some((l) => l.day >= ws && l.day <= addDays(ws, 6)) ? weeklyPct(own, ws, ws === week ? today : addDays(ws, 6)) : null)) };
      }),
      goals: goals.filter((g) => g.status === "active").map((g) => ({ title: g.title, points: snapshots.filter((s) => s.goalId === g.id).sort((a, b) => a.weekStart.localeCompare(b.weekStart)).map((s) => ({ weekStart: s.weekStart, pct: s.pct })) })).filter((g) => g.points.length > 1),
    },
  };
}

/** The seven fixtures of a week, for the Sunday reveal. */
export async function fixturesOf(weekStart: string): Promise<Fixture[]> {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const rows = await db.select().from(schema.matches).where(inArray(schema.matches.day, days));
  return days.map((day) => {
    const m = rows.find((r) => r.day === day);
    return { day, match: m ? { result: m.result, goalsFor: m.goalsFor, goalsAgainst: m.goalsAgainst, cup: m.cup, cupTitle: m.cupTitle, ratio: m.ratio } : null };
  });
}

export type SeasonReveal = Pick<SeasonView, "form" | "crisis" | "table" | "past" | "card"> & { seasonName: string | null; fixtures: Fixture[] };

/** What the Sunday revue reveals: the week's fixtures, the form, the table against past seasons and the player card. */
export async function seasonReveal(weekStart: string, now = nowMs()): Promise<SeasonReveal> {
  const [view, fixtures] = await Promise.all([seasonView(now), fixturesOf(weekStart)]);
  return { seasonName: view.season?.name ?? null, fixtures, form: view.form, crisis: view.crisis, table: view.table, past: view.past, card: view.card };
}
