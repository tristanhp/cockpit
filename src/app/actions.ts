"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db, schema } from "@/db";
import type { Source } from "@/db/schema";
import { resolveDataSourceId } from "@/connectors/notion";
import { discoverAll, syncAll } from "@/sync";
import { applyDayReplan, applyReplanOption, reconcileBlocks, scheduleTask, setTypeRate, type Option } from "@/planning";
import { captureText, fileAllInbox, fileInboxItem, type CaptureOutcome } from "@/capture";
import { changeProject, changeTask, undoChange, type ProjectField, type TaskField } from "@/writeback";
import { openTasks } from "@/lib/queries";
import { fold } from "@/lib/text";
import { requireAuth } from "@/lib/auth/guard";
import { sendToAll } from "@/push";
import { loadSeasonSettings, recordMatch, refreshSeason, saveSeasonSettings } from "@/season";
import { parisDay } from "@/lib/dates";
import { completeReview, confirmWeek, generateProposal, moveProposedBlock, refreshMetrics, saveReviewSettings, saveStep, setBlockExcluded, type CompleteResult } from "@/review";
import type { ReviewData } from "@/db/schema";
import { adjustPlan, closeDay, dismissCatchUp, resolveLeftover, startDay, type CloseInput } from "@/rituals";
import { saveRitualSettings } from "@/rituals/settings";
import { addGoalMilestone, addGoalTask, exportGoals, exportQuietly, linkGoal, saveGoal, saveVision, saveYear, setGoalProgress, setGoalStatus, setProjectExempt, unlinkGoal, type GoalInput, type LinkKind, type VisionInput, type YearInput } from "@/goals";
import type { GoalStatus } from "@/engine/goals";
import type { LeftoverChoice } from "@/planning";

// Local, single-user app for now: the dev server listens on 127.0.0.1 only.
// Authentication comes with hosting (slice 11).

export async function syncNow() {
  await requireAuth();
  const report = await syncAll();
  await reconcileBlocks();
  await refreshMetrics();
  await refreshSeason();
  refresh();
  return report;
}

export async function discoverNow() {
  await requireAuth();
  const added = await discoverAll();
  refresh();
  return added;
}

export async function toggleSource(id: string, enabled: boolean) {
  await requireAuth();
  await db.update(schema.sources).set({ enabled }).where(eq(schema.sources.id, id));
  refresh();
}

const ROLES = ["tasks", "projects", "milestones", "events"] as const;

/** Paste a Notion URL (database, data source or page) and it becomes a source. */
export async function addNotionSource(formData: FormData) {
  await requireAuth();
  const url = String(formData.get("url") ?? "").trim();
  const role = String(formData.get("role") ?? "tasks") as Source["role"];
  const projectName = String(formData.get("projectName") ?? "").trim() || undefined;
  const name = String(formData.get("name") ?? "").trim();
  const ref = url.match(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i)?.[0];
  if (!ref || !ROLES.includes(role as (typeof ROLES)[number])) throw new Error("URL Notion ou rôle invalide");

  const dataSourceId = await resolveDataSourceId(ref);
  await db
    .insert(schema.sources)
    .values({
      id: `notion-${dataSourceId.slice(0, 8)}`,
      kind: "notion",
      role,
      name: name || "Nouvelle base Notion",
      externalRef: ref,
      config: { dataSourceId, projectName },
    })
    .onConflictDoNothing();
  refresh();
}

export async function adoptDiscovery(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id"));
  const role = String(formData.get("role") ?? "tasks") as Source["role"];
  const d = await db.query.discoveries.findFirst({ where: eq(schema.discoveries.id, id) });
  if (!d) return;
  await db
    .insert(schema.sources)
    .values({
      id: `${d.kind}-${d.externalRef.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`,
      kind: d.kind,
      role: d.kind === "gcal" ? "events" : role,
      name: d.name,
      externalRef: d.externalRef,
      config: d.kind === "notion" ? { dataSourceId: d.externalRef } : d.kind === "linear" ? { teamKey: d.externalRef } : { calendarRole: "engagement" },
    })
    .onConflictDoNothing();
  await db.delete(schema.discoveries).where(eq(schema.discoveries.id, id));
  refresh();
}

export async function dismissDiscovery(id: string) {
  await requireAuth();
  await db.update(schema.discoveries).set({ dismissed: true }).where(eq(schema.discoveries.id, id));
  refresh();
}

export type SearchHit = { id: string; kind: "task" | "project"; label: string; hint?: string; href: string };


/** Accent-insensitive search over open tasks and projects, for the command palette. */
export async function searchEverything(query: string): Promise<SearchHit[]> {
  await requireAuth();
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const [tasks, projects] = await Promise.all([openTasks(), db.select().from(schema.projects)]);
  const taskHits = tasks
    .filter((t) => fold(`${t.identifier ?? ""} ${t.title}`).includes(q))
    .slice(0, 8)
    .map((t) => ({ id: t.id, kind: "task" as const, label: t.title, hint: t.project?.name ?? t.source.name, href: `/taches?t=${encodeURIComponent(t.id)}` }));
  const projectHits = projects
    .filter((p) => fold(p.name).includes(q))
    .slice(0, 5)
    .map((p) => ({ id: p.id, kind: "project" as const, label: p.name, hint: p.meteo ?? undefined, href: `/objectifs?vue=projets&p=${encodeURIComponent(p.id)}` }));
  return [...projectHits, ...taskHits];
}


// ---- Write-back -------------------------------------------------------------
// Each action returns `{ ok: false, error }` instead of throwing, so the client can
// roll the optimistic row back and show the message in French.

export type ActionResult = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Une erreur est survenue" };
  }
}

export async function setTaskField(taskId: string, field: TaskField, value: string | number | boolean | null) {
  await requireAuth();
  return run(() => changeTask(taskId, field, value));
}

export async function setProjectField(projectId: string, field: ProjectField, value: string | number | null) {
  await requireAuth();
  return run(() => changeProject(projectId, field, value));
}

export async function undoChangeAction(id: number) {
  await requireAuth();
  return run(() => undoChange(id));
}

/** Linear triage: "Pas pour moi" hides the ticket for good, "Me concerne" keeps it in Mes tâches. */
export async function triageTask(taskId: string, choice: "hidden" | "mine" | "reset") {
  await requireAuth();
  return run(() =>
    db
      .insert(schema.taskOverrides)
      .values({ taskId, hidden: choice === "hidden", mine: choice === "mine", updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: schema.taskOverrides.taskId,
        set: { hidden: choice === "hidden", mine: choice === "mine", updatedAt: new Date().toISOString() },
      }),
  );
}

// ---- Capture and Inbox ------------------------------------------------------

export async function capture(text: string): Promise<(CaptureOutcome & { ok: true }) | { ok: false; error: string }> {
  await requireAuth();
  try {
    const outcome = await captureText(text);
    refresh();
    return { ok: true, ...outcome };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Une erreur est survenue" };
  }
}

export async function fileInbox(id: string, sourceId?: string, projectId?: string | null) {
  await requireAuth();
  return run(() => fileInboxItem(id, sourceId, projectId));
}

export async function fileEverything(): Promise<ActionResult & { filed?: number; failed?: string[] }> {
  await requireAuth();
  try {
    const { filed, failed } = await fileAllInbox();
    refresh();
    return failed.length ? { ok: false, error: failed.join(" · "), filed, failed } : { ok: true, filed, failed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Une erreur est survenue" };
  }
}

export async function dismissInbox(id: string) {
  await requireAuth();
  return run(() => db.update(schema.inbox).set({ status: "dismissed" }).where(eq(schema.inbox.id, id)));
}

export async function addRoutingRule(formData: FormData) {
  await requireAuth();
  const pattern = String(formData.get("pattern") ?? "").trim();
  const sourceId = String(formData.get("sourceId") ?? "");
  const projectId = String(formData.get("projectId") ?? "") || null;
  if (!pattern || !sourceId) return;
  await db.insert(schema.routingRules).values({ id: crypto.randomUUID(), pattern, sourceId, projectId, sortOrder: Date.now() % 1e9 });
  refresh();
}

export async function deleteRoutingRule(id: string) {
  await requireAuth();
  await db.delete(schema.routingRules).where(eq(schema.routingRules.id, id));
  refresh();
}


// ---- Blocks and the replan --------------------------------------------------

export async function replanBlock(blockId: string, key: Option["key"]) {
  await requireAuth();
  return run(() => applyReplanOption(blockId, key));
}

export async function replanMyDay() {
  await requireAuth();
  return run(() => applyDayReplan());
}

/** Plans a block for a task: `start` is a Paris local "YYYY-MM-DDTHH:mm", or omitted to let Cockpit choose. */
export async function planBlock(taskId: string, start?: string) {
  await requireAuth();
  return run(() => scheduleTask(taskId, start));
}

export async function answerTypeRate(name: string, minutes: number) {
  await requireAuth();
  return run(() => setTypeRate(name, minutes));
}

// ---- Notifications ----------------------------------------------------------

export async function subscribePush(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, label: string) {
  await requireAuth();
  return run(() =>
    db
      .insert(schema.pushSubscriptions)
      .values({ id: crypto.randomUUID(), endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, label: label.slice(0, 60) || null, createdAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, label: label.slice(0, 60) || null } }),
  );
}

export async function removePushDevice(id: string) {
  await requireAuth();
  return run(() => db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, id)));
}

export async function sendTestPush() {
  await requireAuth();
  return run(async () => {
    const r = await sendToAll({ title: "Cockpit", body: "Les notifications fonctionnent.", url: "/reglages" });
    if (!r.devices) throw new Error("Aucun appareil enregistré");
    if (!r.sent) throw new Error("L'envoi a échoué sur tous les appareils");
  });
}

// ---- Le cap et la clôture -----------------------------------------------------

export async function resolveLeftoverAction(kind: "block" | "task", id: string, choice: LeftoverChoice) {
  await requireAuth();
  return run(() => resolveLeftover(kind, id, choice));
}

/** The clôture's inbox step may change the date of a capture before filing it. */
export async function setInboxDue(id: string, dueDate: string | null) {
  await requireAuth();
  if (dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { ok: false, error: "Date invalide" } as const;
  return run(() => db.update(schema.inbox).set({ dueDate }).where(eq(schema.inbox.id, id)));
}

/** Closes the day and derives its match. The result comes back only when the daily result is switched on. */
export async function closeDayAction(input: CloseInput): Promise<ActionResult & { daily?: { result: "V" | "N" | "D"; goalsFor: number; goalsAgainst: number } }> {
  await requireAuth();
  try {
    await closeDay(input);
    const match = await recordMatch(parisDay());
    refresh();
    const show = (await loadSeasonSettings()).showDaily;
    return { ok: true, daily: show && match ? { result: match.result, goalsFor: match.goalsFor, goalsAgainst: match.goalsAgainst } : undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Une erreur est survenue" };
  }
}

export async function adjustPlanAction(top3: string[], firstActionTaskId: string | null) {
  await requireAuth();
  return run(() => adjustPlan(top3, firstActionTaskId));
}

export async function dismissCatchUpAction() {
  await requireAuth();
  return run(() => dismissCatchUp());
}

export async function startDayAction(): Promise<ActionResult & { message?: string }> {
  await requireAuth();
  try {
    const message = await startDay();
    refresh();
    return { ok: true, message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Une erreur est survenue" };
  }
}

export async function saveRitualTimes(formData: FormData) {
  await requireAuth();
  const get = (k: string) => String(formData.get(k) ?? "");
  return run(() => saveRitualSettings({ capWeekday: get("capWeekday"), capWeekend: get("capWeekend"), clotureTime: get("clotureTime"), hardStop: get("hardStop") }));
}

// ---- Vision and goals ------------------------------------------------------------

/** Runs an edit, then refreshes the vault files (best effort). */
const edit = (fn: () => Promise<unknown>) =>
  run(async () => {
    await fn();
    await exportQuietly();
  });

export async function saveVisionAction(input: VisionInput) {
  await requireAuth();
  return edit(() => saveVision(input));
}

export async function saveYearAction(input: YearInput) {
  await requireAuth();
  return edit(() => saveYear(input));
}

export async function saveGoalAction(input: GoalInput) {
  await requireAuth();
  return edit(() => saveGoal(input));
}

export async function setGoalStatusAction(id: string, status: GoalStatus) {
  await requireAuth();
  return edit(() => setGoalStatus(id, status));
}

export async function setGoalProgressAction(id: string, current: number) {
  await requireAuth();
  return edit(() => setGoalProgress(id, current));
}

export async function linkGoalAction(goalId: string, kind: LinkKind, refId: string) {
  await requireAuth();
  return edit(() => linkGoal(goalId, kind, refId));
}

export async function unlinkGoalAction(goalId: string, kind: LinkKind, refId: string) {
  await requireAuth();
  return edit(() => unlinkGoal(goalId, kind, refId));
}

export async function setProjectExemptAction(projectId: string, exempt: boolean) {
  await requireAuth();
  return edit(() => setProjectExempt(projectId, exempt));
}

export async function addGoalMilestoneAction(goalId: string, name: string, date: string) {
  await requireAuth();
  return edit(() => addGoalMilestone(goalId, name, date));
}

export async function addGoalTaskAction(goalId: string, input: { title: string; dueDate: string | null; sourceId: string; projectId: string | null }) {
  await requireAuth();
  return edit(() => addGoalTask(goalId, input));
}

/** The button in Réglages: writes the vault files now and says what happened. */
export async function exportGoalsAction(): Promise<ActionResult & { message?: string }> {
  await requireAuth();
  try {
    const r = await exportGoals();
    return { ok: true, message: "written" in r ? `${r.written.length} fichiers écrits.` : `Rien d'écrit : ${r.skipped}.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Une erreur est survenue" };
  }
}

// ---- La revue ---------------------------------------------------------------------

export async function saveReviewStepAction(weekStart: string, patch: Partial<ReviewData>) {
  await requireAuth();
  return run(() => saveStep(weekStart, patch));
}

export async function generateProposalAction() {
  await requireAuth();
  return run(() => generateProposal());
}

export async function excludeBlockAction(weekStart: string, key: string, excluded: boolean) {
  await requireAuth();
  return run(() => setBlockExcluded(weekStart, key, excluded));
}

export async function moveBlockAction(weekStart: string, key: string) {
  await requireAuth();
  return run(() => moveProposedBlock(weekStart, key));
}

export async function confirmWeekAction(weekStart: string): Promise<ActionResult & { created?: number }> {
  await requireAuth();
  try {
    const created = await confirmWeek(weekStart);
    refresh();
    return { ok: true, created };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Une erreur est survenue" };
  }
}

export async function completeReviewAction(weekStart: string): Promise<ActionResult & { result?: CompleteResult }> {
  await requireAuth();
  try {
    const result = await completeReview(weekStart);
    refresh();
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Une erreur est survenue" };
  }
}

export async function saveReviewSettingsAction(formData: FormData) {
  await requireAuth();
  const get = (k: string) => String(formData.get(k) ?? "");
  return run(() => saveReviewSettings({ day: Number(get("day")), time: get("time"), minBudget: Number(get("minBudget")) }));
}

// ---- La saison ---------------------------------------------------------------------

export async function saveSeasonSettingsAction(formData: FormData) {
  await requireAuth();
  const pct = (k: string) => Number(String(formData.get(k) ?? "")) / 100;
  return run(() =>
    saveSeasonSettings({
      winAt: pct("winAt"),
      drawAt: pct("drawAt"),
      cupTypes: String(formData.get("cupTypes") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
      showDaily: formData.get("showDaily") === "on",
    }),
  );
}
