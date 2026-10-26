import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Project, Source, Task } from "@/db/schema";
import type { NewTask, ProjectPatch, TaskPatch, WriteResult } from "@/connectors/types";
import { computePriority, isEffort, isPriority } from "@/engine/priority";
import { connectors, isDemo } from "@/sync";
import { parisDay } from "@/lib/dates";

// Every write to a real source goes through this file, and every one checks
// `isDemo()` first: in demo mode only the local database changes.

export type TaskField = "done" | "dueDate" | "priority" | "effort";
export type ProjectField = "meteo" | "nextAction" | "nextDue" | "priority" | "status";

const DEMO_RESULT: WriteResult = { remoteUpdatedAt: null, response: "démo : base locale uniquement" };
const nowIso = () => new Date().toISOString();

/** Task ids are `<source id>:<external id>`; source ids never contain a colon. */
export function splitTaskId(taskId: string): { sourceId: string; externalId: string } {
  const i = taskId.indexOf(":");
  return { sourceId: taskId.slice(0, i), externalId: taskId.slice(i + 1) };
}

/** French message for a failed write, never a stack trace. */
export function writeError(e: unknown): Error {
  const message = e instanceof Error ? e.message : String(e);
  return new Error(`Le changement n'a pas pu être enregistré dans la source : ${message}`);
}

function toPatch(field: TaskField, value: unknown): TaskPatch {
  switch (field) {
    case "done":
      return { done: Boolean(value) };
    case "dueDate":
      if (value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new Error("Date invalide");
      return { dueDate: value === null ? null : String(value) };
    case "priority":
      if (!isPriority(value)) throw new Error("Priorité invalide");
      return { priority: value };
    case "effort":
      if (value !== null && !isEffort(value)) throw new Error("Effort invalide (1, 2, 3, 5 ou 8)");
      return { effort: value as number | null };
  }
}

async function loadSource(sourceId: string): Promise<Source> {
  const source = await db.query.sources.findFirst({ where: eq(schema.sources.id, sourceId) });
  if (!source) throw new Error("Source introuvable");
  return source;
}

function valueOf(task: Task, field: TaskField): unknown {
  switch (field) {
    case "done":
      return task.status === "done";
    case "dueDate":
      return task.dueDate;
    case "priority":
      return task.priority ?? 0;
    case "effort":
      return task.effort;
  }
}

/**
 * Changes one field of a task: at the source when it has the property, otherwise as a
 * Cockpit-only override that survives syncs. Logged in `change_log` unless `log` is false
 * (undo marks the original entry instead).
 */
export async function changeTask(taskId: string, field: TaskField, value: unknown, opts: { log?: boolean } = {}): Promise<void> {
  const patch = toPatch(field, value);
  const { sourceId, externalId } = splitTaskId(taskId);
  const source = await loadSource(sourceId);
  const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) });
  const connector = connectors[source.kind];
  const overrideField = field === "priority" || field === "effort";
  const atSource = !overrideField || Boolean(connector.canWrite?.(source, field));

  let result: WriteResult = DEMO_RESULT;
  if (atSource) {
    if (!connector.updateTask) throw new Error("Cette source ne sait pas encore être modifiée");
    if (!isDemo()) {
      try {
        result = await connector.updateTask(source, externalId, patch);
      } catch (e) {
        throw writeError(e);
      }
    }
  } else {
    result = { remoteUpdatedAt: null, response: "Cockpit seul : la source n'a pas cette propriété" };
  }

  const at = nowIso();
  if (overrideField && !atSource) {
    await db
      .insert(schema.taskOverrides)
      .values({ taskId, [field]: value as number | null, updatedAt: at })
      .onConflictDoUpdate({ target: schema.taskOverrides.taskId, set: { [field]: value as number | null, updatedAt: at } });
  } else if (overrideField) {
    // Written at the source: a stale local override would only mask it.
    await db.update(schema.taskOverrides).set({ [field]: null, updatedAt: at }).where(eq(schema.taskOverrides.taskId, taskId));
  }

  if (task) {
    const set: Partial<Task> = { remoteUpdatedAt: result.remoteUpdatedAt ?? task.remoteUpdatedAt };
    if (field === "done") {
      set.status = patch.done ? "done" : "todo";
      set.statusRaw = patch.done ? "Fait" : "À faire";
    } else if (field === "dueDate") set.dueDate = patch.dueDate ?? null;
    else if (field === "priority") {
      set.priority = patch.priority;
      set.priorityAuto = false;
    } else if (field === "effort") set.effort = patch.effort ?? null;
    await db.update(schema.tasks).set(set).where(eq(schema.tasks.id, taskId));
  }

  if (opts.log !== false) {
    await db.insert(schema.changeLog).values({
      at,
      entity: "task",
      entityId: taskId,
      label: task?.title ?? taskId,
      field,
      before: task ? valueOf(task, field) : null,
      after: value,
      source: overrideField && !atSource ? "cockpit" : source.id,
      response: result.response,
    });
  }
}

/** Edits a project: Notion for the properties it has, the local database for the rest. */
export async function changeProject(projectId: string, field: ProjectField, value: unknown, opts: { log?: boolean } = {}): Promise<void> {
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
  if (!project?.sourceId) throw new Error("Projet introuvable");
  const source = await loadSource(project.sourceId);
  const connector = connectors[source.kind];

  const patch: ProjectPatch = {};
  if (field === "meteo") patch.meteo = value === null ? null : String(value);
  else if (field === "nextAction") patch.nextAction = value === null ? null : String(value);
  else if (field === "nextDue") {
    if (value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new Error("Date invalide");
    patch.nextDue = value === null ? null : String(value);
  } else if (field === "priority") {
    if (!isPriority(value)) throw new Error("Priorité invalide");
    patch.priority = value;
  } else if (field === "status") {
    if (value !== "actif" && value !== "en-attente") throw new Error("Statut invalide");
    patch.status = value;
  }

  // Priority goes to Notion only when the base has a priority property; the status has none yet.
  const atSource = field !== "status" && (field !== "priority" || Boolean(source.config.priorityProp));
  let result: WriteResult = DEMO_RESULT;
  if (atSource && !isDemo()) {
    if (!connector.updateProject) throw new Error("Cette source ne sait pas encore être modifiée");
    try {
      result = await connector.updateProject(source, project.externalId ?? "", patch);
    } catch (e) {
      throw writeError(e);
    }
  } else if (!atSource) result = { remoteUpdatedAt: null, response: "Cockpit seul : la source n'a pas cette propriété" };

  const set: Partial<Project> = { remoteUpdatedAt: result.remoteUpdatedAt ?? project.remoteUpdatedAt };
  if (field === "meteo") set.meteo = patch.meteo;
  if (field === "nextAction") set.nextAction = patch.nextAction;
  if (field === "nextDue") set.nextDue = patch.nextDue;
  if (field === "priority") {
    set.priority = patch.priority;
    set.priorityManual = true;
    set.protected = false;
  }
  if (field === "status") {
    set.status = patch.status;
    set.priorityManual = true;
  }
  await db.update(schema.projects).set(set).where(eq(schema.projects.id, projectId));

  if (opts.log !== false) {
    const before = { meteo: project.meteo, nextAction: project.nextAction, nextDue: project.nextDue, priority: project.priority, status: project.status }[field];
    await db.insert(schema.changeLog).values({
      at: nowIso(),
      entity: "project",
      entityId: projectId,
      label: project.name,
      field,
      before,
      after: value,
      source: atSource ? source.id : "cockpit",
      response: result.response,
    });
  }
}

/** Writes the previous value back and marks the entry undone. Conflicts and creations cannot be undone. */
export async function undoChange(id: number): Promise<void> {
  const entry = await db.query.changeLog.findFirst({ where: eq(schema.changeLog.id, id) });
  if (!entry || entry.undone) return;
  if (entry.source === "sync" || entry.field === "create") throw new Error("Ce changement ne peut pas être annulé");
  if (entry.entity === "task") await changeTask(entry.entityId, entry.field as TaskField, entry.before, { log: false });
  else await changeProject(entry.entityId, entry.field as ProjectField, entry.before, { log: false });
  await db.update(schema.changeLog).set({ undone: true }).where(eq(schema.changeLog.id, id));
}

export type CreatedTask = { id: string; sourceId: string; title: string };

/** Creates a task at its source (Notion page, Linear issue) and mirrors it locally right away. */
export async function createTask(sourceId: string, projectId: string | null, task: NewTask): Promise<CreatedTask> {
  const source = await loadSource(sourceId);
  const connector = connectors[source.kind];
  if (source.role !== "tasks" || !connector.createTask) throw new Error("Cette source n'accepte pas de nouvelles tâches");
  const project = projectId ? await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }) : undefined;

  let externalId = `demo-${crypto.randomUUID().slice(0, 8)}`;
  let identifier: string | null = null;
  let url: string | null = null;
  let remoteUpdatedAt: string | null = null;
  let response = DEMO_RESULT.response;
  if (!isDemo()) {
    try {
      const created = await connector.createTask(source, { ...task, projectName: project?.name ?? null });
      ({ externalId, identifier = null, url = null, remoteUpdatedAt, response } = { ...created, identifier: created.identifier ?? null, url: created.url ?? null });
    } catch (e) {
      throw writeError(e);
    }
  }

  const id = `${source.id}:${externalId}`;
  const priority = computePriority({
    sourceKind: source.kind === "linear" ? "linear" : "notion",
    sourcePriority: task.priority ?? null,
    sourceHasProperty: task.priority !== undefined,
    projectPriority: project?.priority ?? null,
    dueDate: task.dueDate ?? null,
    today: parisDay(),
    graded: source.config.graded,
  });
  await db.insert(schema.tasks).values({
    id,
    sourceId: source.id,
    externalId,
    identifier,
    url,
    title: task.title,
    status: "todo",
    statusRaw: "À faire",
    dueDate: task.dueDate ?? null,
    projectId: project?.id ?? null,
    assignedToMe: source.kind === "linear" ? true : null,
    priority: priority.priority,
    priorityAuto: priority.auto,
    effort: task.effort ?? null,
    remoteUpdatedAt,
    syncedAt: nowIso(),
  });
  await db.insert(schema.changeLog).values({
    at: nowIso(),
    entity: "task",
    entityId: id,
    label: task.title,
    field: "create",
    before: null,
    after: task.title,
    source: source.id,
    response,
  });
  return { id, sourceId: source.id, title: task.title };
}
