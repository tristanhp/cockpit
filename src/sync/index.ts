import { eq, inArray } from "drizzle-orm";
import { resolveOverride } from "@/engine/conflict";
import { computePriority, projectScaleFromLevel } from "@/engine/priority";
import { db, schema } from "@/db";
import type { Source } from "@/db/schema";
import { gcalConnector } from "@/connectors/gcal";
import { linearConnector } from "@/connectors/linear";
import { notionConnector } from "@/connectors/notion";
import type { Connector, PullResult } from "@/connectors/types";
import { parisDay } from "@/lib/dates";
import { fold } from "@/lib/text";

export const connectors: Record<Source["kind"], Connector> = {
  notion: notionConnector,
  linear: linearConnector,
  gcal: gcalConnector,
};

// Projects first, so tasks pulled afterwards can be linked to them by name.
const ROLE_ORDER: Source["role"][] = ["projects", "milestones", "tasks", "events", "reviews"];

const norm = (s: string) => fold(s).trim();

export type SyncReport = { sourceId: string; name: string; ok: boolean; count: number; error?: string }[];

/** `npm run demo` runs on fictional data: never call the real APIs. */
export const isDemo = () => process.env.COCKPIT_DEMO === "1";

export async function syncAll(): Promise<SyncReport> {
  const all = await db.select().from(schema.sources).where(eq(schema.sources.enabled, true));
  if (isDemo()) {
    await db.update(schema.sources).set({ lastSyncAt: new Date().toISOString() }).where(eq(schema.sources.enabled, true));
    await touchLastSync();
    return all.map((s) => ({ sourceId: s.id, name: s.name, ok: true, count: s.lastSyncCount ?? 0 }));
  }
  all.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

  const report: SyncReport = [];
  for (const source of all) {
    const now = new Date().toISOString();
    try {
      const missing = await connectors[source.kind].missingSetup();
      if (missing) throw new Error(missing);
      const result = await connectors[source.kind].pull(source);
      const count = await store(source, result, now);
      await db
        .update(schema.sources)
        .set({ lastSyncAt: now, lastSyncError: null, lastSyncCount: count, config: { ...source.config, ...result.configPatch } })
        .where(eq(schema.sources.id, source.id));
      report.push({ sourceId: source.id, name: source.name, ok: true, count });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await db.update(schema.sources).set({ lastSyncError: error }).where(eq(schema.sources.id, source.id));
      report.push({ sourceId: source.id, name: source.name, ok: false, count: 0, error });
    }
  }
  await touchLastSync();
  return report;
}

async function touchLastSync() {
  const value = new Date().toISOString();
  await db.insert(schema.settings).values({ key: "last_sync", value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

async function store(source: Source, r: PullResult, now: string): Promise<number> {
  const id = (externalId: string) => `${source.id}:${externalId}`;

  if (r.projects) {
    const [pillars, levels] = await Promise.all([db.select().from(schema.pillars), db.select().from(schema.levels)]);
    const pillarId = (n?: string | null) => (n ? pillars.find((p) => norm(p.name) === norm(n))?.id ?? null : null);
    const levelId = (n?: string | null) => (n ? levels.find((l) => norm(l.name) === norm(n))?.id ?? null : null);
    const existing = new Map((await db.select().from(schema.projects).where(eq(schema.projects.sourceId, source.id))).map((p) => [p.id, p]));
    await replace(schema.projects, source.id, r.projects.map((p) => {
      const scale = projectScaleFromLevel(p.levelName);
      const kept = existing.get(id(p.externalId));
      const manual = kept?.priorityManual ?? false;
      return {
      id: id(p.externalId),
      sourceId: source.id,
      externalId: p.externalId,
      url: p.url,
      name: p.name,
      pillarId: pillarId(p.pillarName),
      levelId: levelId(p.levelName),
      meteo: p.meteo,
      nextAction: p.nextAction,
      nextDue: p.nextDue,
      notes: p.notes,
      priority: manual ? kept!.priority : scale.priority,
      status: manual ? kept!.status : scale.status,
      protected: manual ? kept!.protected : scale.protected,
      priorityManual: manual,
      remoteUpdatedAt: p.remoteUpdatedAt,
      syncedAt: now,
    };
    }));
    return r.projects.length;
  }

  if (r.milestones) {
    await replace(schema.milestones, source.id, r.milestones.map((m) => ({
      id: id(m.externalId),
      sourceId: source.id,
      externalId: m.externalId,
      url: m.url,
      name: m.name,
      startDate: m.startDate ? parisDay(m.startDate) : null,
      endDate: m.endDate ? parisDay(m.endDate) : null,
      type: m.type,
      approximate: m.approximate ?? false,
      notes: m.notes,
      syncedAt: now,
    })));
    return r.milestones.length;
  }

  if (r.tasks) {
    const projects = await db.select({ id: schema.projects.id, name: schema.projects.name, priority: schema.projects.priority }).from(schema.projects);
    const project = (n?: string | null) => (n ? projects.find((p) => norm(p.name) === norm(n)) : undefined);
    const overrides = new Map((await db.select().from(schema.taskOverrides)).map((o) => [o.taskId, o]));
    const today = parisDay();
    const overrideStale: string[] = [];
    const conflicts: (typeof schema.changeLog.$inferInsert)[] = [];
    await replace(schema.tasks, source.id, r.tasks.map((t) => {
      const taskId = id(t.externalId);
      let priority = t.priority ?? null;
      let effort = t.effort ?? null;
      let locked = false;
      const o = overrides.get(taskId);
      if (o && (o.priority != null || o.effort != null)) {
        if (resolveOverride(o.updatedAt, t.remoteUpdatedAt ?? null) === "keep-override") {
          if (o.priority != null) { priority = o.priority; locked = true; }
          if (o.effort != null) effort = o.effort;
        } else {
          // Latest edit wins: the source changed after Cockpit's value, so the source value stands.
          const log = (field: string, before: unknown, after: unknown) =>
            conflicts.push({ at: now, entity: "task", entityId: taskId, label: t.title, field, before, after, source: "sync", response: "conflit : la source a été modifiée après Cockpit" });
          if (o.priority != null) log("priority", o.priority, priority);
          if (o.effort != null) log("effort", o.effort, effort);
          overrideStale.push(taskId);
        }
      }
      const proj = project(t.projectName);
      const computed = computePriority({
        sourceKind: source.kind === "linear" ? "linear" : "notion",
        sourcePriority: priority,
        sourceHasProperty: Boolean(t.hasPriorityProp) || locked,
        projectPriority: proj?.priority ?? null,
        dueDate: t.dueDate ? parisDay(t.dueDate) : null,
        today,
        graded: source.config.graded,
        locked,
      });
      return {
      id: taskId,
      sourceId: source.id,
      externalId: t.externalId,
      identifier: t.identifier,
      url: t.url,
      title: t.title,
      status: t.status,
      statusRaw: t.statusRaw,
      dueDate: t.dueDate ? parisDay(t.dueDate) : null,
      projectId: proj?.id ?? null,
      assignedToMe: t.assignedToMe,
      assigneeName: t.assigneeName,
      priority: computed.priority,
      priorityAuto: computed.auto,
      effort,
      taskType: t.taskType ?? null,
      remoteUpdatedAt: t.remoteUpdatedAt,
      syncedAt: now,
    };
    }));
    if (overrideStale.length) {
      for (const taskId of overrideStale) {
        const entry = overrides.get(taskId)!;
        const rowStillRelevant = entry.hidden || entry.mine;
        if (rowStillRelevant) await db.update(schema.taskOverrides).set({ priority: null, effort: null }).where(eq(schema.taskOverrides.taskId, taskId));
        else await db.delete(schema.taskOverrides).where(eq(schema.taskOverrides.taskId, taskId));
      }
    }
    if (conflicts.length) await db.insert(schema.changeLog).values(conflicts);
    return r.tasks.length;
  }

  if (r.events) {
    await replace(schema.events, source.id, r.events.map((e) => ({
      id: id(e.externalId),
      sourceId: source.id,
      externalId: e.externalId,
      url: e.url,
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      day: parisDay(e.start),
      isExam: e.isExam ?? false,
      description: e.description ?? null,
      syncedAt: now,
    })));
    return r.events.length;
  }
  return 0;
}

type Replaceable = typeof schema.tasks | typeof schema.projects | typeof schema.milestones | typeof schema.events;

/** The pulled list is the full truth for that source: swap it in one transaction. */
async function replace<T extends Replaceable>(table: T, sourceId: string, rows: T["$inferInsert"][]) {
  await db.transaction(async (tx) => {
    await tx.delete(table).where(eq(table.sourceId, sourceId));
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      if (chunk.length) await tx.insert(table).values(chunk as never);
    }
  });
}

/** Asks every configured tool what exists, and records what isn't registered yet. */
export async function discoverAll(): Promise<number> {
  if (isDemo()) return 0;
  const known = await db.select({ kind: schema.sources.kind, ref: schema.sources.externalRef, config: schema.sources.config }).from(schema.sources);
  const isKnown = (kind: Source["kind"], ref: string) =>
    known.some((k) => k.kind === kind && (k.ref.replace(/-/g, "") === ref.replace(/-/g, "") || k.config.dataSourceId?.replace(/-/g, "") === ref.replace(/-/g, "")));

  let added = 0;
  for (const connector of Object.values(connectors)) {
    if (await connector.missingSetup()) continue;
    let found;
    try {
      found = await connector.discover();
    } catch {
      continue;
    }
    const fresh = found.filter((f) => !isKnown(connector.kind, f.externalRef));
    if (!fresh.length) continue;
    const ids = fresh.map((f) => `${connector.kind}:${f.externalRef}`);
    const existing = new Set(
      (await db.select({ id: schema.discoveries.id }).from(schema.discoveries).where(inArray(schema.discoveries.id, ids))).map((d) => d.id),
    );
    const rows = fresh
      .filter((f) => !existing.has(`${connector.kind}:${f.externalRef}`))
      .map((f) => ({ id: `${connector.kind}:${f.externalRef}`, kind: connector.kind, externalRef: f.externalRef, name: f.name, detail: f.detail ?? null, foundAt: new Date().toISOString() }));
    if (rows.length) await db.insert(schema.discoveries).values(rows);
    added += rows.length;
  }
  return added;
}
