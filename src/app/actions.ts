"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db, schema } from "@/db";
import type { Source } from "@/db/schema";
import { resolveDataSourceId } from "@/connectors/notion";
import { discoverAll, syncAll } from "@/sync";
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
