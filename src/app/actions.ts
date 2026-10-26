"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db, schema } from "@/db";
import type { Source } from "@/db/schema";
import { resolveDataSourceId } from "@/connectors/notion";
import { discoverAll, syncAll } from "@/sync";
import { captureText, fileAllInbox, fileInboxItem, type CaptureOutcome } from "@/capture";
import { changeProject, changeTask, undoChange, type ProjectField, type TaskField } from "@/writeback";
import { openTasks } from "@/lib/queries";
import { fold } from "@/lib/text";

// Local, single-user app for now: the dev server listens on 127.0.0.1 only.
// Authentication comes with hosting (slice 11).

export async function syncNow() {
  const report = await syncAll();
  refresh();
  return report;
}

export async function discoverNow() {
  const added = await discoverAll();
  refresh();
  return added;
}

export async function toggleSource(id: string, enabled: boolean) {
  await db.update(schema.sources).set({ enabled }).where(eq(schema.sources.id, id));
  refresh();
}

const ROLES = ["tasks", "projects", "milestones", "events"] as const;

/** Paste a Notion URL (database, data source or page) and it becomes a source. */
export async function addNotionSource(formData: FormData) {
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
  await db.update(schema.discoveries).set({ dismissed: true }).where(eq(schema.discoveries.id, id));
  refresh();
}

export type SearchHit = { id: string; kind: "task" | "project"; label: string; hint?: string; href: string };


/** Accent-insensitive search over open tasks and projects, for the command palette. */
export async function searchEverything(query: string): Promise<SearchHit[]> {
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
    .map((p) => ({ id: p.id, kind: "project" as const, label: p.name, hint: p.meteo ?? undefined, href: `/cockpit?p=${encodeURIComponent(p.id)}` }));
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
  return run(() => changeTask(taskId, field, value));
}

export async function setProjectField(projectId: string, field: ProjectField, value: string | number | null) {
  return run(() => changeProject(projectId, field, value));
}

export async function undoChangeAction(id: number) {
  return run(() => undoChange(id));
}

/** Linear triage: "Pas pour moi" hides the ticket for good, "Me concerne" keeps it in Mes tâches. */
export async function triageTask(taskId: string, choice: "hidden" | "mine" | "reset") {
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
  try {
    const outcome = await captureText(text);
    refresh();
    return { ok: true, ...outcome };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Une erreur est survenue" };
  }
}

export async function fileInbox(id: string, sourceId?: string, projectId?: string | null) {
  return run(() => fileInboxItem(id, sourceId, projectId));
}

export async function fileEverything(): Promise<ActionResult & { filed?: number; failed?: string[] }> {
  try {
    const { filed, failed } = await fileAllInbox();
    refresh();
    return failed.length ? { ok: false, error: failed.join(" · "), filed, failed } : { ok: true, filed, failed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Une erreur est survenue" };
  }
}

export async function dismissInbox(id: string) {
  return run(() => db.update(schema.inbox).set({ status: "dismissed" }).where(eq(schema.inbox.id, id)));
}

export async function addRoutingRule(formData: FormData) {
  const pattern = String(formData.get("pattern") ?? "").trim();
  const sourceId = String(formData.get("sourceId") ?? "");
  const projectId = String(formData.get("projectId") ?? "") || null;
  if (!pattern || !sourceId) return;
  await db.insert(schema.routingRules).values({ id: crypto.randomUUID(), pattern, sourceId, projectId, sortOrder: Date.now() % 1e9 });
  refresh();
}

export async function deleteRoutingRule(id: string) {
  await db.delete(schema.routingRules).where(eq(schema.routingRules.id, id));
  refresh();
}
