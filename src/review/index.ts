import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, gte, isNotNull, lte, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Review, ReviewData, StoredProposal } from "@/db/schema";
import { budgetFor, computeMetrics, load, RESUME_QUESTION, reviewAlerts, reviewMarkdown, velocity, type Load, type Metrics, type ProposedBlock, type ReviewAlert, type WeekRecord } from "@/engine/week";
import { addDays, isoWeek, isoWeekday, nowMs, parisDay, parisMinutes } from "@/lib/dates";
import { SIGNAL_LABEL } from "@/engine/goals";
import { goalsOverview } from "@/goals";
import { createWeekBlocks, otherSlot, proposeWeekFor } from "@/planning";
import { connectors, isDemo } from "@/sync";

// The weekly review: Cockpit is the source of truth; a finished review is mirrored to Notion and exported to Markdown.

export type ReviewSettings = { day: number; time: string; minBudget: number };
export const DEFAULT_REVIEW: ReviewSettings = { day: 7, time: "19:30", minBudget: 8 };

const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

export async function loadReviewSettings(): Promise<ReviewSettings> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, "review") });
  const saved = (row?.value as Partial<ReviewSettings> | undefined) ?? {};
  return {
    day: Number.isInteger(saved.day) && saved.day! >= 1 && saved.day! <= 7 ? saved.day! : DEFAULT_REVIEW.day,
    time: isTime(saved.time) ? saved.time : DEFAULT_REVIEW.time,
    minBudget: typeof saved.minBudget === "number" && saved.minBudget >= 1 ? saved.minBudget : DEFAULT_REVIEW.minBudget,
  };
}

export async function saveReviewSettings(next: ReviewSettings): Promise<void> {
  if (!Number.isInteger(next.day) || next.day < 1 || next.day > 7) throw new Error("Jour invalide");
  if (!isTime(next.time)) throw new Error("Heure invalide (hh:mm)");
  if (!Number.isFinite(next.minBudget) || next.minBudget < 1 || next.minBudget > 100) throw new Error("Le budget minimum doit être entre 1 et 100 points");
  await db.insert(schema.settings).values({ key: "review", value: next }).onConflictDoUpdate({ target: schema.settings.key, set: { value: next } });
}

export const weekStartOf = (day: string) => addDays(day, 1 - isoWeekday(day));

// ---- Metrics ----------------------------------------------------------------------------------------

const tracked = (m: Metrics | undefined) => Boolean(m && (m.blocksPlanned || m.pointsPlanned || m.ritualsDone || m.sportPlanned));

async function metricsFor(weekStart: string, now: number): Promise<Metrics> {
  const end = addDays(weekStart, 6);
  const [blocks, plans, events, sources] = await Promise.all([
    db.select().from(schema.blocks),
    db.select().from(schema.dayPlans).where(and(isNotNull(schema.dayPlans.closedAt), gte(schema.dayPlans.day, weekStart), lte(schema.dayPlans.day, end))),
    db.select().from(schema.events).where(and(gte(schema.events.day, weekStart), lte(schema.events.day, end))),
    db.select().from(schema.sources).where(and(eq(schema.sources.kind, "gcal"), eq(schema.sources.enabled, true))),
  ]);
  const socle = new Set(sources.filter((s) => s.config.calendarRole === "socle").map((s) => s.id));
  return computeMetrics({
    blocks: blocks.filter((b) => parisDay(b.start) >= weekStart && parisDay(b.start) <= end).map((b) => ({ status: b.status, effort: b.effort, end: Date.parse(b.end) })),
    closedDays: plans.length,
    sport: events.filter((e) => !e.allDay && socle.has(e.sourceId)).map((e) => ({ start: Date.parse(e.start), end: Date.parse(e.end) })),
    now,
  });
}

/**
 * Recomputes the current week and the five before it. Called on sync. A finished week with nothing to compute
 * from (no blocks, rituals or sport left in the database) keeps the values stored earlier instead of being zeroed.
 */
export async function refreshMetrics(now = nowMs()): Promise<void> {
  const current = weekStartOf(parisDay(new Date(now)));
  const computedAt = new Date(now).toISOString();
  const stored = new Set((await db.select({ weekStart: schema.weeklyMetrics.weekStart }).from(schema.weeklyMetrics)).map((r) => r.weekStart));
  for (let i = 0; i <= 5; i++) {
    const weekStart = addDays(current, -7 * i);
    const m = await metricsFor(weekStart, now);
    if (i > 0 && !tracked(m) && stored.has(weekStart)) continue;
    await db.insert(schema.weeklyMetrics).values({ weekStart, ...m, computedAt }).onConflictDoUpdate({ target: schema.weeklyMetrics.weekStart, set: { ...m, computedAt } });
  }
}

// ---- Drafts -------------------------------------------------------------------------------------------

export async function reviewOf(weekStart: string): Promise<Review | null> {
  return (await db.query.reviews.findFirst({ where: and(eq(schema.reviews.kind, "weekly"), eq(schema.reviews.weekStart, weekStart)) })) ?? null;
}

/** The review of a week, created as a draft when it does not exist yet. */
export async function ensureDraft(weekStart: string, now = nowMs()): Promise<Review> {
  const found = await reviewOf(weekStart);
  if (found) return found;
  await db.insert(schema.reviews).values({ id: `review-${weekStart}`, kind: "weekly", weekStart, status: "draft", data: {}, createdAt: new Date(now).toISOString() }).onConflictDoNothing();
  return (await reviewOf(weekStart))!;
}

/** The tick prepares a draft once the review day and time have come, so it is ready when you open it. */
export async function prepareDraft(now = nowMs()): Promise<boolean> {
  const settings = await loadReviewSettings();
  const day = parisDay(new Date(now));
  if (isoWeekday(day) !== settings.day || parisMinutes(new Date(now)) < minutesOf(settings.time)) return false;
  const weekStart = weekStartOf(day);
  if (await reviewOf(weekStart)) return false;
  await ensureDraft(weekStart, now);
  return true;
}

export async function saveStep(weekStart: string, patch: Partial<ReviewData>): Promise<void> {
  const review = await ensureDraft(weekStart);
  if (review.status === "done") throw new Error("Cette revue est terminée");
  await db.update(schema.reviews).set({ data: { ...review.data, ...patch } }).where(eq(schema.reviews.id, review.id));
}

// ---- What the screens need ------------------------------------------------------------------------------

export type ReviewView = {
  weekStart: string;
  nextWeek: string;
  weekNumber: number;
  settings: ReviewSettings;
  review: Review;
  metrics: Metrics;
  last: Metrics | null;
  lastFocus: { projectId: string; name: string; result: string }[];
  alerts: ReviewAlert[];
  resumeQuestion: string;
  goals: { id: string; title: string; progress: string; pct: number; signals: string[]; drifting: boolean }[];
  focus: { projectId: string; name: string; result: string }[];
  budget: { velocity: number; min: number; budget: number; weeks: number[] };
  thisWeekLoad: Load;
  proposal: StoredProposal | null;
};

/** `create: false` reads without creating the draft (Aujourd'hui only needs the load). */
export async function reviewView(now = nowMs(), opts: { create?: boolean } = {}): Promise<ReviewView> {
  const today = parisDay(new Date(now));
  const settings = await loadReviewSettings();
  const weekStart = weekStartOf(today);
  const create = opts.create ?? true;
  const [review, rows, reviews, goals, projects] = await Promise.all([
    create ? ensureDraft(weekStart, now) : reviewOf(weekStart).then((r) => r ?? ({ id: "", kind: "weekly", weekStart, status: "draft", data: {}, createdAt: "", completedAt: null } as Review)),
    db.select().from(schema.weeklyMetrics),
    db.select().from(schema.reviews).where(eq(schema.reviews.kind, "weekly")),
    goalsOverview(now),
    db.select().from(schema.projects),
  ]);
  const live = await metricsFor(weekStart, now);
  const byWeek = new Map(rows.map((r) => [r.weekStart, r as Metrics]));
  byWeek.set(weekStart, live);
  const lastWeek = addDays(weekStart, -7);
  const beforeWeek = addDays(weekStart, -14);

  const record = (ws: string): WeekRecord => {
    const m = byWeek.get(ws);
    const r = reviews.find((x) => x.weekStart === ws);
    return {
      tracked: tracked(m), revueDone: r?.status === "done", ritualsDone: m?.ritualsDone ?? 0, sportDone: m?.sportDone ?? 0, sportPlanned: m?.sportPlanned ?? 0,
      bedtimesOnTarget: r?.data.numbers?.bedtimesOnTarget ?? null, blocksKept: m?.blocksKept ?? 0, blocksPlanned: m?.blocksPlanned ?? 0,
    };
  };

  const history = [-28, -21, -14, -7].map((d) => byWeek.get(addDays(weekStart, d))).filter((m): m is Metrics => tracked(m)).map((m) => m.pointsDone);
  const vel = velocity(history);
  const budget = budgetFor(vel, settings.minBudget);
  const previous = reviews.find((r) => r.weekStart === lastWeek);
  const lastFocus = previous?.data.focus ?? [];

  const priorityProjects = projects.filter((p) => p.status === "actif" && !p.protected && (p.priority === 1 || p.priority === 2)).sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9) || a.name.localeCompare(b.name, "fr"));
  const focus = review.data.focus ?? priorityProjects.map((p) => ({ projectId: p.id, name: p.name, result: p.nextAction ?? "" }));

  const active = [...goals.seasonGoals, ...goals.yearGoals].filter((g) => g.goal.status === "active");
  return {
    weekStart,
    nextWeek: addDays(weekStart, 7),
    weekNumber: isoWeek(weekStart),
    settings,
    review,
    metrics: live,
    last: byWeek.get(lastWeek) ?? null,
    lastFocus,
    alerts: reviewAlerts({ before: record(beforeWeek), last: record(lastWeek), week: record(weekStart) }),
    resumeQuestion: RESUME_QUESTION,
    goals: active.map((g) => ({ id: g.goal.id, title: g.goal.title, progress: g.progress.label, pct: g.progress.pct, signals: g.signals.map((s) => SIGNAL_LABEL[s]), drifting: g.signals.includes("sans-fil") })),
    focus,
    budget: { velocity: vel, min: settings.minBudget, budget, weeks: history },
    thisWeekLoad: load(live.pointsPlanned, budget),
    proposal: review.data.proposal ?? null,
  };
}

/** For Aujourd'hui: the current week's planned points against the budget. */
export async function currentWeekLoad(now = nowMs()): Promise<{ load: Load; planned: number; budget: number }> {
  const view = await reviewView(now, { create: false });
  return { load: view.thisWeekLoad, planned: view.metrics.pointsPlanned, budget: view.budget.budget };
}

// ---- The proposed week ------------------------------------------------------------------------------------

const toStored = (weekStart: string, budget: number, alreadyPlanned: number, p: Awaited<ReturnType<typeof proposeWeekFor>>, now: number): StoredProposal => ({
  weekStart, budget, alreadyPlanned, blocks: p.blocks, unplaced: p.unplaced, generatedAt: new Date(now).toISOString(),
});

/** Computes the week ahead and stores it in the draft. Nothing is written to a calendar. */
export async function generateProposal(now = nowMs()): Promise<StoredProposal> {
  const view = await reviewView(now);
  const sansFil = view.goals.filter((g) => g.drifting && view.review.data.threads?.[g.id] !== "pause");
  const proposal = await proposeWeekFor(view.nextWeek, view.budget.budget, sansFil.map((g) => ({ goalId: g.id, title: `Fil : ${g.title}`, minutes: 60 })), now);
  const stored = toStored(view.nextWeek, view.budget.budget, 0, proposal, now);
  await saveStep(view.weekStart, { proposal: stored, step: 4 });
  return stored;
}

async function storedProposal(weekStart: string): Promise<{ review: Review; proposal: StoredProposal }> {
  const review = await ensureDraft(weekStart);
  if (!review.data.proposal) throw new Error("Génère d'abord la proposition");
  return { review, proposal: review.data.proposal };
}

export async function setBlockExcluded(weekStart: string, key: string, excluded: boolean): Promise<void> {
  const { review, proposal } = await storedProposal(weekStart);
  if (review.data.confirmedAt) throw new Error("La semaine est déjà confirmée");
  const blocks = proposal.blocks.map((b) => (b.key === key ? { ...b, excluded } : b));
  await saveStep(weekStart, { proposal: { ...proposal, blocks }, adjustments: [...(review.data.adjustments ?? []), `${excluded ? "Retiré" : "Remis"} : ${proposal.blocks.find((b) => b.key === key)?.title ?? key}`] });
}

/** "Autre créneau": moves one proposed block to the next later free slot. */
export async function moveProposedBlock(weekStart: string, key: string, now = nowMs()): Promise<void> {
  const { review, proposal } = await storedProposal(weekStart);
  if (review.data.confirmedAt) throw new Error("La semaine est déjà confirmée");
  const block = proposal.blocks.find((b) => b.key === key);
  if (!block) throw new Error("Bloc introuvable");
  const others = proposal.blocks.filter((b) => b.key !== key && !b.excluded);
  const slot = await otherSlot(proposal.weekStart, block as ProposedBlock, others, now);
  if (!slot) throw new Error("Aucun autre créneau libre cette semaine");
  const blocks = proposal.blocks.map((b) => (b.key === key ? { ...b, start: slot.start, end: slot.end, key: `${b.taskId ?? `goal:${b.goalId}`}@${slot.start}`, reason: `${b.reason} · déplacé` } : b)).sort((a, b) => a.start - b.start);
  await saveStep(weekStart, { proposal: { ...proposal, blocks }, adjustments: [...(review.data.adjustments ?? []), `Déplacé : ${block.title}`] });
}

/** Confirms the week: the blocks that were not removed are written to the calendar. */
export async function confirmWeek(weekStart: string, now = nowMs()): Promise<number> {
  const { review, proposal } = await storedProposal(weekStart);
  if (review.data.confirmedAt) throw new Error("La semaine est déjà confirmée");
  const chosen = proposal.blocks.filter((b) => !b.excluded);
  const created = await createWeekBlocks(chosen as ProposedBlock[], "Revue : semaine confirmée");
  await saveStep(weekStart, { confirmedAt: new Date(now).toISOString() });
  return created;
}

// ---- Completing -----------------------------------------------------------------------------------------------

const fmtTime = (ms: number) => new Intl.DateTimeFormat("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(ms));

export type CompleteResult = { notion: string; markdown: string };

/** Marks the review done, mirrors it to Notion and writes the Markdown summary. Both are best effort and reported. */
export async function completeReview(weekStart: string, now = nowMs()): Promise<CompleteResult> {
  const view = await reviewView(now);
  if (view.weekStart !== weekStart) throw new Error("Cette revue n'est plus celle de la semaine en cours");
  await db.update(schema.reviews).set({ status: "done", completedAt: new Date(now).toISOString() }).where(eq(schema.reviews.id, view.review.id));
  const data = view.review.data;
  const summary = {
    weekStart, weekNumber: view.weekNumber, metrics: view.metrics, numbers: data.numbers ?? null,
    focus: view.focus.map((f) => ({ name: f.name, result: f.result })),
    goals: view.goals.map((g) => ({ title: g.title, progress: g.progress, signal: g.signals[0] ?? null })),
    resume: data.resume ?? null,
    proposed: (data.proposal?.blocks ?? []).filter((b) => !b.excluded).map((b) => ({ title: b.title, start: fmtTime(b.start), end: fmtTime(b.end) })),
  };
  return { notion: await mirrorToNotion(summary, data), markdown: await exportMarkdown(summary) };
}

async function mirrorToNotion(summary: Parameters<typeof reviewMarkdown>[0], data: ReviewData): Promise<string> {
  const sources = (await db.select().from(schema.sources).where(and(eq(schema.sources.role, "reviews"), eq(schema.sources.enabled, true), ne(schema.sources.kind, "gcal")))).filter((s) => s.config.reviewMap);
  if (!sources.length) return "pas de base de revues configurée";
  if (isDemo()) return "désactivé en mode démo";
  const done: string[] = [];
  for (const source of sources) {
    const push = connectors[source.kind].push;
    if (!push) continue;
    try {
      await push(source, {
        title: `Revue semaine ${summary.weekNumber}`,
        week: summary.weekStart,
        fields: {
          win: data.numbers?.win ?? null, energy: data.numbers?.energy ?? null, sleep: data.numbers?.sleepAvg ?? null, bedtimes: data.numbers?.bedtimesOnTarget ?? null,
          focus: summary.focus.map((f) => `${f.name} : ${f.result}`).join("\n"), blocks: `${summary.metrics.blocksKept}/${summary.metrics.blocksPlanned}`,
          points: summary.metrics.pointsDone, resume: data.resume ?? null, summary: reviewMarkdown(summary),
        },
      });
      done.push(source.name);
    } catch (e) {
      return `échec (${source.name}) : ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return done.length ? `envoyée à ${done.join(", ")}` : "aucune source ne sait recevoir une revue";
}

async function exportMarkdown(summary: Parameters<typeof reviewMarkdown>[0]): Promise<string> {
  const dir = process.env.VAULT_REVIEWS_PATH;
  if (!dir) return "VAULT_REVIEWS_PATH n'est pas défini";
  if (isDemo()) return "désactivé en mode démo";
  try {
    await mkdir(dir, { recursive: true });
    const file = `revue-${summary.weekStart.slice(0, 4)}-S${String(summary.weekNumber).padStart(2, "0")}.md`;
    await writeFile(path.join(dir, file), reviewMarkdown(summary));
    return file;
  } catch (e) {
    return `échec : ${e instanceof Error ? e.message : String(e)}`;
  }
}
