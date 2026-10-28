import { MIN, consume, isUsable, placeTask, type Interval, type Slot } from "@/engine/planning";
import { addDays, parisInstant } from "@/lib/dates";

// Pure rules of the weekly review: velocity and budget, load, weekly metrics, the "jamais deux fois
// de suite" alerts, the proposed week and the Markdown summary. The database lives in `src/review`.

// ---- Velocity, budget, load ------------------------------------------------------------

export const DEFAULT_POINTS = 2;

/** Median of the effort points done over the last four complete weeks (most recent last). */
export function velocity(weeks: number[]): number {
  const last = weeks.slice(-4);
  if (!last.length) return 0;
  const sorted = [...last].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

export const budgetFor = (vel: number, min: number) => Math.max(min, vel);

export type Load = { ratio: number; over: boolean; message: string | null };

/** Planned points against the budget; a message only when the week is over it. */
export function load(plannedPoints: number, budget: number): Load {
  const ratio = budget > 0 ? Math.round((plannedPoints / budget) * 100) / 100 : 0;
  const over = plannedPoints > budget;
  return {
    ratio,
    over,
    message: over ? `Semaine chargée : ${plannedPoints} points prévus pour un budget de ${budget}. Retire ${Math.round((plannedPoints - budget) * 10) / 10} points, ou assume le dépassement.` : null,
  };
}

// ---- Weekly metrics ---------------------------------------------------------------------

export type MetricBlock = { status: string; effort: number | null; end: number };
export type Metrics = { pointsDone: number; pointsPlanned: number; blocksKept: number; blocksPlanned: number; ritualsDone: number; sportDone: number; sportPlanned: number };

/**
 * Blocks count as planned once they have ended (or are done); a block still ahead is neither kept nor missed.
 * Sport sessions are the events of the socle calendar: planned, and done once they have ended.
 */
export function computeMetrics(i: { blocks: MetricBlock[]; closedDays: number; sport: Interval[]; now: number }): Metrics {
  const live = i.blocks.filter((b) => b.status !== "dropped");
  const due = live.filter((b) => b.status === "done" || b.end <= i.now);
  const done = live.filter((b) => b.status === "done");
  return {
    pointsDone: done.reduce((n, b) => n + (b.effort ?? 0), 0),
    pointsPlanned: live.reduce((n, b) => n + (b.effort ?? 0), 0),
    blocksKept: done.length,
    blocksPlanned: due.length,
    ritualsDone: i.closedDays,
    sportDone: i.sport.filter((s) => s.end <= i.now).length,
    sportPlanned: i.sport.length,
  };
}

// ---- "Jamais deux fois de suite" ----------------------------------------------------------

export type WeekRecord = {
  /** False when nothing was tracked that week, so a new user is never accused of missing it. */
  tracked: boolean;
  revueDone: boolean;
  ritualsDone: number;
  sportDone: number;
  sportPlanned: number;
  bedtimesOnTarget: number | null;
  blocksKept: number;
  blocksPlanned: number;
};

export type AlertKind = "revue" | "cloture" | "sport" | "sommeil" | "blocs";
export type ReviewAlert = { kind: AlertKind; message: string };

export const RESUME_QUESTION = "Qu'est-ce qui te permettrait de reprendre ?";
export const BLOCKS_FLOOR = 0.6;
export const RITUALS_FLOOR = 4;
export const BEDTIMES_FLOOR = 5;

/**
 * Each alert fires only when the same thing happened two weeks in a row. The week under review (`week`) is
 * complete for blocks, rituals and sport, so those compare it with `last`; the revue and the sleep numbers of
 * the week under review do not exist yet, so they compare `last` with `before`.
 */
export function reviewAlerts(i: { before: WeekRecord; last: WeekRecord; week: WeekRecord }): ReviewAlert[] {
  const { before, last, week } = i;
  const out: ReviewAlert[] = [];
  const both = (a: WeekRecord, b: WeekRecord) => a.tracked && b.tracked;
  const ratio = (r: WeekRecord) => (r.blocksPlanned > 0 ? r.blocksKept / r.blocksPlanned : null);

  if (both(before, last) && !before.revueDone && !last.revueDone) out.push({ kind: "revue", message: "La revue a manqué deux semaines de suite." });
  if (both(last, week) && last.ritualsDone < RITUALS_FLOOR && week.ritualsDone < RITUALS_FLOOR) out.push({ kind: "cloture", message: "La clôture a été rare deux semaines de suite." });
  if (both(last, week) && last.sportPlanned > 0 && week.sportPlanned > 0 && last.sportDone < last.sportPlanned && week.sportDone < week.sportPlanned) out.push({ kind: "sport", message: "Le sport est sous le plan deux semaines de suite." });
  if (both(before, last) && before.bedtimesOnTarget !== null && last.bedtimesOnTarget !== null && before.bedtimesOnTarget < BEDTIMES_FLOOR && last.bedtimesOnTarget < BEDTIMES_FLOOR) out.push({ kind: "sommeil", message: "L'heure du coucher a dérapé deux semaines de suite." });
  const [rl, rw] = [ratio(last), ratio(week)];
  if (both(last, week) && rl !== null && rw !== null && rl < BLOCKS_FLOOR && rw < BLOCKS_FLOOR) out.push({ kind: "blocs", message: "Moins de 60 % des blocs tenus deux semaines de suite." });
  return out;
}

// ---- Proposing the week -----------------------------------------------------------------------

export type WeekTask = { id: string; title: string; priority: number | null; dueDate: string | null; effort: number | null; minutes: number };
export type Reservation = { goalId: string; title: string; minutes: number };

export type ProposedBlock = { key: string; taskId: string | null; goalId: string | null; title: string; start: number; end: number; points: number; reason: string };
export type Unplaced = { id: string; title: string; reason: string; points: number };
export type Proposal = { blocks: ProposedBlock[]; unplaced: Unplaced[]; planned: number; budget: number; load: Load };

const PRIORITY_NAME: Record<number, string> = { 1: "Urgent", 2: "Haute", 3: "Moyenne", 4: "Basse", 0: "Sans priorité" };
/** Urgent first, Aucune last. */
const rank = (p: number | null) => (p === 1 ? 1 : p === 2 ? 2 : p === 3 ? 3 : p === 4 ? 4 : 5);
const points = (t: { effort: number | null }) => t.effort ?? DEFAULT_POINTS;

export type ProposeInput = {
  weekStart: string;
  tasks: WeekTask[];
  /** One block to reserve for each goal without a thread. */
  reservations: Reservation[];
  /** Free stretches of the week (protected and busy events already removed). */
  slots: Slot[];
  budget: number;
  /** Points of blocks already on the calendar this week: they use the budget first. */
  alreadyPlanned: number;
  now: number;
  neighbours?: Interval[];
  allowAvoided?: string[];
};

/**
 * Fills the week in priority order within the point budget. Urgent work is always placed (and may
 * overshoot the budget); one block is reserved for each drifting goal; then Haute, Moyenne, Basse as the
 * budget allows. Once something does not fit, every lower priority is dropped, so Basse work goes first.
 * Nothing is written here.
 */
export function proposeWeek(i: ProposeInput): Proposal {
  const from = Math.max(parisInstant(i.weekStart, 0), i.now);
  const to = parisInstant(addDays(i.weekStart, 7), 0) - 1;
  let slots = i.slots.filter((s) => s.end > from && s.start < to);
  const neighbours = [...(i.neighbours ?? [])];
  const blocks: ProposedBlock[] = [];
  const unplaced: Unplaced[] = [];
  let used = i.alreadyPlanned;

  const place = (key: string, title: string, minutes: number, priority: number | null, dueDate: string | null) => {
    const p = placeTask({ minutes, priority, dueDate }, slots, { now: i.now, notBefore: from, notAfter: to, neighbours, allowAvoided: i.allowAvoided });
    if (!p) return null;
    slots = consume(slots, p);
    neighbours.push({ start: p.start, end: p.end });
    return p;
  };
  const taskBlock = (t: WeekTask, reasonPrefix: string): ProposedBlock | null => {
    const p = place(t.id, t.title, t.minutes, t.priority, t.dueDate);
    if (!p) return null;
    const why = [reasonPrefix, ...p.reasons].filter(Boolean).join(" · ");
    return { key: `${t.id}@${p.start}`, taskId: t.id, goalId: null, title: t.title, start: p.start, end: p.end, points: points(t), reason: why };
  };

  const ordered = [...i.tasks].sort((a, b) => rank(a.priority) - rank(b.priority) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || (a.effort ?? 99) - (b.effort ?? 99) || a.title.localeCompare(b.title, "fr"));
  const urgent = ordered.filter((t) => t.priority === 1);
  const rest = ordered.filter((t) => t.priority !== 1);

  for (const t of urgent) {
    const b = taskBlock(t, PRIORITY_NAME[1]);
    if (b) {
      blocks.push(b);
      used += b.points;
    } else unplaced.push({ id: t.id, title: t.title, reason: "aucun créneau libre cette semaine", points: points(t) });
  }

  for (const r of i.reservations) {
    const p = place(r.goalId, r.title, r.minutes, 3, null);
    if (p) blocks.push({ key: `goal:${r.goalId}@${p.start}`, taskId: null, goalId: r.goalId, title: r.title, start: p.start, end: p.end, points: 0, reason: "un bloc réservé pour un objectif sans fil" });
    else unplaced.push({ id: r.goalId, title: r.title, reason: "aucun créneau libre cette semaine", points: 0 });
  }

  let cutRank = Infinity;
  for (const t of rest) {
    const pts = points(t);
    if (rank(t.priority) > cutRank) {
      unplaced.push({ id: t.id, title: t.title, reason: "budget épuisé : le travail moins prioritaire passe après", points: pts });
      continue;
    }
    if (used + pts > i.budget) {
      cutRank = rank(t.priority);
      unplaced.push({ id: t.id, title: t.title, reason: "hors budget de points", points: pts });
      continue;
    }
    const b = taskBlock(t, PRIORITY_NAME[t.priority ?? 0] ?? "");
    if (b) {
      blocks.push(b);
      used += b.points;
    } else unplaced.push({ id: t.id, title: t.title, reason: "aucun créneau libre cette semaine", points: pts });
  }

  blocks.sort((a, b) => a.start - b.start);
  return { blocks, unplaced, planned: used, budget: i.budget, load: load(used, i.budget) };
}

/** Moves a block to the next later free slot (wrapping to the earliest), for the "Autre créneau" button. */
export function nextSlotFor(block: { start: number; end: number; priority: number | null; dueDate: string | null }, slots: Slot[], now: number, weekStart: string): Interval | null {
  const minutes = Math.max(15, Math.round((block.end - block.start) / MIN));
  const input = { minutes, priority: block.priority, dueDate: block.dueDate };
  const to = parisInstant(addDays(weekStart, 7), 0) - 1;
  const usable = slots.filter((s) => isUsable(s));
  const later = placeTask(input, usable, { now, notBefore: block.end, notAfter: to });
  const found = later ?? placeTask(input, usable, { now, notBefore: parisInstant(weekStart, 0), notAfter: to });
  if (!found) return null;
  return found.start === block.start ? null : { start: found.start, end: found.end };
}

// ---- Markdown ---------------------------------------------------------------------------------

export type ReviewSummary = {
  weekStart: string;
  weekNumber: number;
  metrics: Metrics;
  numbers: { sleepAvg: string; bedtimesOnTarget: number | null; energy: number | null; win: string } | null;
  focus: { name: string; result: string }[];
  goals: { title: string; progress: string; signal: string | null }[];
  resume: string | null;
  proposed: { title: string; start: string; end: string }[];
};

const orDash = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "—" : String(v));

export function reviewMarkdown(r: ReviewSummary): string {
  const m = r.metrics;
  return [
    `# Revue de la semaine ${r.weekNumber} (du ${r.weekStart})`,
    "",
    "## Une page",
    "",
    `- Points d'effort faits : ${m.pointsDone} / ${m.pointsPlanned}`,
    `- Blocs tenus : ${m.blocksKept} / ${m.blocksPlanned}`,
    `- Sport : ${m.sportDone} / ${m.sportPlanned}`,
    `- Clôtures faites : ${m.ritualsDone} / 7`,
    r.resume ? `- Pour reprendre : ${r.resume}` : null,
    "",
    "## Chiffres",
    "",
    `- Sommeil moyen : ${orDash(r.numbers?.sleepAvg)}`,
    `- Couchers à l'heure : ${orDash(r.numbers?.bedtimesOnTarget)} / 7`,
    `- Énergie : ${orDash(r.numbers?.energy)} / 5`,
    `- Une victoire : ${orDash(r.numbers?.win)}`,
    "",
    "## Les fils",
    "",
    ...(r.goals.length ? r.goals.map((g) => `- ${g.title} : ${g.progress}${g.signal ? ` (${g.signal})` : ""}`) : ["_(aucun objectif actif)_"]),
    "",
    "## Focus de la semaine à venir",
    "",
    ...(r.focus.length ? r.focus.map((f) => `- ${f.name} : ${f.result || "—"}`) : ["_(aucun focus)_"]),
    "",
    "## Semaine proposée",
    "",
    ...(r.proposed.length ? r.proposed.map((p) => `- ${p.start} → ${p.end} · ${p.title}`) : ["_(rien de planifié)_"]),
    "",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}
