import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { InboxItem } from "@/db/schema";
import { parseCapture, suggestDestination, type Destination, type Parsed } from "@/engine/capture";
import { parisDay } from "@/lib/dates";
import { fold } from "@/lib/text";
import { isDemo } from "@/sync";
import { createTask, writeError } from "@/writeback";

export type CaptureOutcome =
  | { status: "filed"; message: string }
  | { status: "inbox"; message: string };

const FALLBACK_PATTERN = "*";

async function routingContext() {
  const [rules, projects, sources, tasks] = await Promise.all([
    db.select().from(schema.routingRules).orderBy(asc(schema.routingRules.sortOrder)),
    db.select().from(schema.projects),
    db.select().from(schema.sources),
    db.select({ sourceId: schema.tasks.sourceId, projectId: schema.tasks.projectId }).from(schema.tasks),
  ]);
  const taskSources = sources.filter((s) => s.enabled && s.role === "tasks" && (s.kind === "notion" || s.kind === "linear"));

  // A project's tasks live in the source that already holds most of them.
  const sourceOfProject = (projectId: string): string | null => {
    const project = projects.find((p) => p.id === projectId);
    const pinned = taskSources.find((s) => s.config.projectName && project && fold(s.config.projectName) === fold(project.name));
    if (pinned) return pinned.id;
    const counts = new Map<string, number>();
    for (const t of tasks) if (t.projectId === projectId && taskSources.some((s) => s.id === t.sourceId)) counts.set(t.sourceId, (counts.get(t.sourceId) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };

  return {
    rules: rules.filter((r) => r.pattern !== FALLBACK_PATTERN),
    fallback: rules.find((r) => r.pattern === FALLBACK_PATTERN),
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
    // The Linear team key doubles as the ticket prefix; a source can override it with `teamKey`.
    sources: taskSources.map((s) => ({
      id: s.id,
      kind: s.kind as "notion" | "linear",
      projectName: s.config.projectName,
      ticketPattern: s.kind === "linear" ? (s.config.teamKey ?? s.externalRef) : undefined,
    })),
    sourceOfProject,
  };
}

async function writeIdea(parsed: Parsed, text: string): Promise<boolean> {
  const dir = process.env.VAULT_INBOX_PATH;
  if (!dir || isDemo()) return false;
  const slug = fold(parsed.title).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "idee";
  const file = path.join(dir, `${parisDay()}-${slug}.md`);
  await mkdir(dir, { recursive: true });
  await writeFile(file, `# ${parsed.title}\n\n${text}\n\n_Capturé le ${parisDay()} depuis Cockpit._\n`, { flag: "wx" });
  return true;
}

/** One line in, one outcome out: filed straight away when the destination is obvious, else the inbox. */
export async function captureText(input: string, opts: { via?: string } = {}): Promise<CaptureOutcome> {
  const text = input.trim();
  if (!text) throw new Error("Rien à capturer");
  const parsed = parseCapture(text, parisDay());
  if (!parsed.title) throw new Error("Il manque le titre");
  const ctx = await routingContext();
  const dest = parsed.kind === "task" ? suggestDestination(parsed, ctx) : null;

  if (parsed.kind === "idea") {
    try {
      if (await writeIdea(parsed, text)) return { status: "filed", message: "Idée rangée dans le coffre." };
    } catch (e) {
      throw writeError(e);
    }
  }

  if (dest) {
    await createTask(dest.sourceId, dest.projectId, { title: parsed.title, dueDate: parsed.due }, opts);
    return { status: "filed", message: `Tâche créée : ${parsed.title}` };
  }

  const suggested: Destination | null = parsed.kind === "task" && ctx.fallback ? { sourceId: ctx.fallback.sourceId, projectId: ctx.fallback.projectId, why: "rule" } : null;
  await db.insert(schema.inbox).values({
    id: crypto.randomUUID(),
    text,
    kind: parsed.kind,
    title: parsed.title,
    dueDate: parsed.due,
    dueTime: parsed.time,
    suggestedSourceId: suggested?.sourceId ?? null,
    suggestedProjectId: suggested?.projectId ?? null,
    note:
      parsed.kind === "event"
        ? "Les événements restent ici jusqu'à l'écriture dans l'agenda."
        : parsed.kind === "idea"
          ? "Aucun dossier de coffre configuré (VAULT_INBOX_PATH) : l'idée reste ici."
          : null,
    createdAt: new Date().toISOString(),
  });
  return { status: "inbox", message: "Ajouté à l'Inbox." };
}

async function fileOne(item: InboxItem, sourceId: string, projectId: string | null) {
  await createTask(sourceId, projectId, { title: item.title, dueDate: item.dueDate });
  await db.update(schema.inbox).set({ status: "filed" }).where(eq(schema.inbox.id, item.id));
}

export async function fileInboxItem(id: string, sourceId?: string, projectId?: string | null): Promise<void> {
  const item = await db.query.inbox.findFirst({ where: eq(schema.inbox.id, id) });
  if (!item || item.status !== "pending") return;
  if (item.kind !== "task") throw new Error("Seules les tâches peuvent être rangées pour l'instant");
  const target = sourceId ?? item.suggestedSourceId;
  if (!target) throw new Error("Choisis une destination");
  await fileOne(item, target, projectId === undefined ? item.suggestedProjectId : projectId);
}

/** Files every pending task that has a suggestion; returns how many were filed. */
export async function fileAllInbox(): Promise<{ filed: number; failed: string[] }> {
  const items = await db.select().from(schema.inbox).where(eq(schema.inbox.status, "pending"));
  let filed = 0;
  const failed: string[] = [];
  for (const item of items) {
    if (item.kind !== "task" || !item.suggestedSourceId) continue;
    try {
      await fileOne(item, item.suggestedSourceId, item.suggestedProjectId);
      filed++;
    } catch (e) {
      failed.push(`${item.title} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { filed, failed };
}
