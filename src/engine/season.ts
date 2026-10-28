// Pure rules of La saison, the game layer: each day is a match against that day's plan, scored silently,
// revealed once a week. Nothing here reads the database (that is `src/season`).

export type MatchResult = "V" | "N" | "D";

export type SeasonSettings = {
  /** A ratio at or above this is a win (3 points). */
  winAt: number;
  /** A ratio at or above this, below `winAt`, is a draw (1 point); below it, a loss. */
  drawAt: number;
  /** Milestone types that make their day a cup match (evaluations always do). */
  cupTypes: string[];
  /** Show the daily result at the clôture. Off by default: the Sunday revue reveals. */
  showDaily: boolean;
};

export const DEFAULT_SEASON: SeasonSettings = { winAt: 0.8, drawAt: 0.6, cupTypes: ["Évaluation"], showDaily: false };

export const POINTS: Record<MatchResult, number> = { V: 3, N: 1, D: 0 };

export function resultOf(ratio: number, s: Pick<SeasonSettings, "winAt" | "drawAt"> = DEFAULT_SEASON): MatchResult {
  if (ratio >= s.winAt) return "V";
  if (ratio >= s.drawAt) return "N";
  return "D";
}

// ---- Scoring a day ----------------------------------------------------------------------------

/** A block or a ritual of the day. A block weighs its task's effort points plus one for the block itself; a ritual weighs one. */
export type DayItem = { kind: "block" | "ritual"; effort: number; done: boolean; mandatory: boolean };

export type Score = {
  plannedPoints: number;
  donePoints: number;
  blocksPlanned: number;
  blocksKept: number;
  ritualsPlanned: number;
  ritualsDone: number;
  mandatoryMissed: number;
  goalsFor: number;
  goalsAgainst: number;
  ratio: number;
  result: MatchResult;
  points: number;
  cup: boolean;
  cupTitle: string | null;
};

const weight = (i: DayItem) => (i.kind === "block" ? i.effort + 1 : 1);

/**
 * `ratio` = weighted done over weighted planned; the result comes from the ratio alone. `goalsFor` is
 * effort points done + blocks kept + rituals done, `goalsAgainst` the mandatory items missed (display only).
 * A cup match counts double goals. A day with nothing planned is not a match (null).
 */
export function scoreDay(items: DayItem[], cup: { title: string } | null, settings: SeasonSettings = DEFAULT_SEASON): Score | null {
  const planned = items.reduce((n, i) => n + weight(i), 0);
  if (planned === 0) return null;
  const done = items.filter((i) => i.done);
  const blocks = items.filter((i) => i.kind === "block");
  const rituals = items.filter((i) => i.kind === "ritual");
  const ratio = Math.round((done.reduce((n, i) => n + weight(i), 0) / planned) * 10_000) / 10_000;
  const result = resultOf(ratio, settings);
  const k = cup ? 2 : 1;
  const missed = items.filter((i) => i.mandatory && !i.done).length;
  return {
    plannedPoints: planned,
    donePoints: done.reduce((n, i) => n + weight(i), 0),
    blocksPlanned: blocks.length,
    blocksKept: blocks.filter((i) => i.done).length,
    ritualsPlanned: rituals.length,
    ritualsDone: rituals.filter((i) => i.done).length,
    mandatoryMissed: missed,
    goalsFor: k * (done.filter((i) => i.kind === "block").reduce((n, i) => n + i.effort, 0) + blocks.filter((i) => i.done).length + rituals.filter((i) => i.done).length),
    goalsAgainst: k * missed,
    ratio,
    result,
    points: POINTS[result],
    cup: Boolean(cup),
    cupTitle: cup?.title ?? null,
  };
}

// ---- Form, crise, table ---------------------------------------------------------------------------

export type Played = { day: string; result: MatchResult; goalsFor: number; goalsAgainst: number; cup?: boolean };

const byDay = <T extends { day: string }>(m: T[]) => [...m].sort((a, b) => a.day.localeCompare(b.day));

/** The last five results, oldest first. */
export const form = (matches: Played[], n = 5): MatchResult[] => byDay(matches).slice(-n).map((m) => m.result);

/** Two losses in a row, counting the most recent matches. */
export const isCrisis = (matches: Played[]): boolean => {
  const last = byDay(matches).slice(-2);
  return last.length === 2 && last.every((m) => m.result === "D");
};

export type TableRow = { played: number; points: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; perMatch: number };

export function table(matches: Pick<Played, "result" | "goalsFor" | "goalsAgainst">[]): TableRow {
  const wins = matches.filter((m) => m.result === "V").length;
  const draws = matches.filter((m) => m.result === "N").length;
  const points = wins * POINTS.V + draws * POINTS.N;
  return {
    played: matches.length, points, wins, draws, losses: matches.length - wins - draws,
    goalsFor: matches.reduce((n, m) => n + m.goalsFor, 0), goalsAgainst: matches.reduce((n, m) => n + m.goalsAgainst, 0),
    perMatch: matches.length ? Math.round((points / matches.length) * 100) / 100 : 0,
  };
}

// ---- The player card -----------------------------------------------------------------------------------

export type PillarInputs = {
  /** Effort points done and planned over the last four weeks. */
  effortDone: number;
  effortPlanned: number;
  blocksKept: number;
  blocksPlanned: number;
  /** For each habit of the pillar: the average over the four weeks of min(1, weekly % / target). */
  habitRatios: number[];
  /** Progress (0 to 100) of the pillar's active goals. */
  goalPcts: number[];
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * A rating from 0 to 99: the mean of whichever of four components exist for the pillar (effort done over planned,
 * blocks kept over planned, habits at target, goal progress), each between 0 and 1. A better component never lowers
 * the rating. Null when the pillar has none of them, so a pillar with no data shows no number.
 */
export function pillarRating(i: PillarInputs): number | null {
  const parts: number[] = [];
  if (i.effortPlanned > 0) parts.push(clamp01(i.effortDone / i.effortPlanned));
  if (i.blocksPlanned > 0) parts.push(clamp01(i.blocksKept / i.blocksPlanned));
  if (i.habitRatios.length) parts.push(mean(i.habitRatios.map(clamp01)));
  if (i.goalPcts.length) parts.push(clamp01(mean(i.goalPcts) / 100));
  return parts.length ? Math.round(mean(parts) * 99) : null;
}

/** Pillar weight from the best priority among its active projects (Urgent 4 … Basse 1, none 1). */
export const pillarWeight = (priorities: (number | null)[]): number => {
  const best = priorities.reduce<number>((w, p) => Math.max(w, p === 1 ? 4 : p === 2 ? 3 : p === 3 ? 2 : 1), 1);
  return best;
};

/** The overall rating: the mean of the pillar ratings weighted by pillar priority. */
export function overallRating(ratings: { rating: number | null; weight: number }[]): number | null {
  const rated = ratings.filter((r): r is { rating: number; weight: number } => r.rating !== null);
  const total = rated.reduce((n, r) => n + r.weight, 0);
  return total ? Math.round(rated.reduce((n, r) => n + r.rating * r.weight, 0) / total) : null;
}

// ---- Awards ----------------------------------------------------------------------------------------------

export type AwardKind = "meilleur-pilier" | "meilleur-projet" | "serie-victoires" | "remontada";
export type AwardDoc = { kind: AwardKind; subject: string; value: string };

export function longestWinRun(matches: Played[]): { length: number; end: string } | null {
  let best: { length: number; end: string } | null = null;
  let run = 0;
  for (const m of byDay(matches)) {
    run = m.result === "V" ? run + 1 : 0;
    if (run > 0 && (!best || run > best.length)) best = { length: run, end: m.day };
  }
  return best;
}

/**
 * The biggest comeback: after a crise (two or more losses in a row), the longest run of matches without a loss
 * that follows it. The value is that run; the subject says how deep the crise was.
 */
export function biggestComeback(matches: Played[]): { run: number; crisis: number; end: string } | null {
  const sorted = byDay(matches);
  let best: { run: number; crisis: number; end: string } | null = null;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].result !== "D") continue;
    let j = i;
    while (j < sorted.length && sorted[j].result === "D") j++;
    const crisis = j - i;
    if (crisis >= 2) {
      let k = j;
      while (k < sorted.length && sorted[k].result !== "D") k++;
      const run = k - j;
      if (run > 0 && (!best || run > best.run)) best = { run, crisis, end: sorted[k - 1].day };
    }
    i = j - 1;
  }
  return best;
}

export function computeAwards(i: { matches: Played[]; pillarRatings: { name: string; rating: number | null }[]; projectPoints: { name: string; points: number }[] }): AwardDoc[] {
  const out: AwardDoc[] = [];
  const pillar = [...i.pillarRatings].filter((p): p is { name: string; rating: number } => p.rating !== null).sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name, "fr"))[0];
  if (pillar) out.push({ kind: "meilleur-pilier", subject: pillar.name, value: `${pillar.rating} / 99` });
  const project = [...i.projectPoints].filter((p) => p.points > 0).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "fr"))[0];
  if (project) out.push({ kind: "meilleur-projet", subject: project.name, value: `${project.points} points d'effort` });
  const run = longestWinRun(i.matches);
  if (run) out.push({ kind: "serie-victoires", subject: `${run.length} victoire${run.length > 1 ? "s" : ""} de suite`, value: run.end });
  const back = biggestComeback(i.matches);
  if (back) out.push({ kind: "remontada", subject: `${back.run} match${back.run > 1 ? "s" : ""} sans défaite après ${back.crisis} défaites`, value: back.end });
  return out;
}

export const AWARD_LABEL: Record<AwardKind, string> = { "meilleur-pilier": "Meilleur pilier", "meilleur-projet": "Meilleur buteur", "serie-victoires": "Plus longue série", remontada: "Plus belle remontada" };
