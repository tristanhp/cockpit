import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Proposal } from "@/db/schema";
import { captureText } from "@/capture";
import { addGoalMilestone, addGoalTask } from "@/goals";
import { moveBlockToSlot } from "@/planning";
import { nowMs } from "@/lib/dates";
import { changeTask } from "@/writeback";
import { isExpired, parsePayload, rationaleSchema, summarize, type Names, type Payload, type Summary } from "./schema";

// What Claude proposes. A proposal only ever stores a request: nothing changes until it is accepted here, and
// accepting runs the same write paths as the screens (S2 write-back, S3 moves, S6 goals), so every guard and
// log applies. The change log records "via Claude".

export const VIA = "Claude";

export type ProposalView = Proposal & { summary: Summary };

async function namesOf(p: Payload): Promise<Names> {
  switch (p.kind) {
    case "task_update":
      return { task: (await db.query.tasks.findFirst({ where: eq(schema.tasks.id, p.data.taskId) }))?.title };
    case "reschedule": {
      const b = await db.query.blocks.findFirst({ where: eq(schema.blocks.id, p.data.blockId) });
      return { block: b ? { title: b.title, start: b.start } : undefined };
    }
    case "goal_breakdown":
      return { goal: (await db.query.goals.findFirst({ where: eq(schema.goals.id, p.data.goalId) }))?.title };
    default:
      return {};
  }
}

const present = async (row: Proposal): Promise<ProposalView> => {
  const parsed = parsePayload(row.kind, row.payload);
  return { ...row, summary: parsed.ok ? summarize(parsed.payload, await namesOf(parsed.payload)) : { title: `Proposition illisible (${row.kind})`, lines: [parsed.error] } };
};

/** The first enabled Notion task source (Linear tickets need a team), else the first task source. */
async function defaultTaskSource(): Promise<string | null> {
  const sources = (await db.select().from(schema.sources)).filter((s) => s.role === "tasks" && s.enabled && s.kind !== "gcal");
  return (sources.find((s) => s.kind === "notion") ?? sources[0])?.id ?? null;
}

/** Everything the payload points at has to exist, so a proposal never fails for a typo in an id. */
async function checkReferences(p: Payload): Promise<void> {
  const missing = (what: string, id: string) => new Error(`${what} introuvable : ${id}`);
  switch (p.kind) {
    case "task_update":
      if (!(await db.query.tasks.findFirst({ where: eq(schema.tasks.id, p.data.taskId) }))) throw missing("Tâche", p.data.taskId);
      return;
    case "reschedule": {
      const block = await db.query.blocks.findFirst({ where: eq(schema.blocks.id, p.data.blockId) });
      if (!block) throw missing("Bloc", p.data.blockId);
      if (["done", "dropped"].includes(block.status)) throw new Error("Ce bloc est déjà fait ou abandonné : on ne le déplace pas");
      return;
    }
    case "goal_breakdown": {
      if (!(await db.query.goals.findFirst({ where: eq(schema.goals.id, p.data.goalId) }))) throw missing("Objectif", p.data.goalId);
      if (p.data.tasks.length && !(await defaultTaskSource()) && p.data.tasks.some((t) => !t.sourceId)) throw new Error("Aucune source de tâches configurée pour créer les tâches");
      for (const t of p.data.tasks) {
        if (t.sourceId && !(await db.query.sources.findFirst({ where: eq(schema.sources.id, t.sourceId) }))) throw missing("Source", t.sourceId);
        if (t.projectId && !(await db.query.projects.findFirst({ where: eq(schema.projects.id, t.projectId) }))) throw missing("Projet", t.projectId);
      }
      return;
    }
    default:
      return;
  }
}

/** Stores a proposal after checking it. Returns the id and what the card will say. Changes nothing else. */
export async function createProposal(kind: string, payload: unknown, rationale: string, now = nowMs()): Promise<{ id: string; summary: Summary }> {
  const parsed = parsePayload(kind, payload);
  if (!parsed.ok) throw new Error(parsed.error);
  const why = rationaleSchema.safeParse(rationale);
  if (!why.success) throw new Error(why.error.issues.map((i) => i.message).join(" ; "));
  await checkReferences(parsed.payload);
  const id = `prop-${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(schema.proposals).values({ id, kind: parsed.payload.kind, payload: parsed.payload.data, rationale: why.data, status: "pending", proposedBy: "claude", createdAt: new Date(now).toISOString() });
  return { id, summary: summarize(parsed.payload, await namesOf(parsed.payload)) };
}

/** Pending proposals older than seven days become expired. Nothing else happens to them. */
export async function expirePending(now = nowMs()): Promise<number> {
  const pending = await db.select({ id: schema.proposals.id, createdAt: schema.proposals.createdAt }).from(schema.proposals).where(eq(schema.proposals.status, "pending"));
  const old = pending.filter((p) => isExpired(p.createdAt, now));
  for (const { id } of old) await db.update(schema.proposals).set({ status: "expired", decidedAt: new Date(now).toISOString() }).where(and(eq(schema.proposals.id, id), eq(schema.proposals.status, "pending")));
  return old.length;
}

export async function listProposals(opts: { status?: Proposal["status"]; limit?: number } = {}, now = nowMs()): Promise<ProposalView[]> {
  await expirePending(now);
  const rows = await db.select().from(schema.proposals).where(opts.status ? eq(schema.proposals.status, opts.status) : undefined).orderBy(desc(schema.proposals.createdAt)).limit(opts.limit ?? 100);
  return Promise.all(rows.map(present));
}

export async function pendingCount(now = nowMs()): Promise<number> {
  await expirePending(now);
  return (await db.select({ id: schema.proposals.id }).from(schema.proposals).where(eq(schema.proposals.status, "pending"))).length;
}

/** Pending proposals that break a given goal down, for the goal panel. */
export async function proposalsForGoal(goalId: string): Promise<ProposalView[]> {
  return (await listProposals({ status: "pending" })).filter((p) => p.kind === "goal_breakdown" && (p.payload as { goalId?: string }).goalId === goalId);
}

async function pendingRow(id: string, now: number): Promise<Proposal> {
  await expirePending(now);
  const row = await db.query.proposals.findFirst({ where: eq(schema.proposals.id, id) });
  if (!row) throw new Error("Proposition introuvable");
  if (row.status === "expired") throw new Error("Cette proposition a expiré (plus de sept jours)");
  if (row.status !== "pending") throw new Error(row.status === "accepted" ? "Cette proposition est déjà acceptée" : "Cette proposition a déjà été refusée");
  return row;
}

/** Runs the change through the app's own write paths. Returns a short French result. */
async function apply(p: Payload, rationale: string): Promise<string> {
  const via = { via: VIA };
  switch (p.kind) {
    case "capture": {
      const { text, kind, destination } = p.data;
      let line = text;
      if (kind === "idea" && !/^id[ée]e\s*:/i.test(line)) line = `idée : ${line}`;
      if (kind === "event" && !/^(rdv|rendez-vous)\s*:/i.test(line)) line = `rdv : ${line}`;
      const tag = destination?.replace(/[^\p{L}\p{N}]+/gu, "");
      if (tag && !line.includes("#")) line = `${line} #${tag}`;
      return (await captureText(line, via)).message;
    }
    case "reschedule": {
      await moveBlockToSlot(p.data.blockId, p.data.start, `Proposition de Claude : ${rationale}`);
      return `Bloc déplacé au ${p.data.start.replace("T", " à ")}`;
    }
    case "task_update":
      await changeTask(p.data.taskId, p.data.field, p.data.value, via);
      return "Tâche modifiée";
    case "goal_breakdown": {
      const source = await defaultTaskSource();
      let milestones = 0;
      let tasks = 0;
      try {
        for (const m of p.data.milestones) {
          await addGoalMilestone(p.data.goalId, m.name, m.date);
          milestones++;
        }
        for (const t of p.data.tasks) {
          await addGoalTask(p.data.goalId, { title: t.title, dueDate: t.dueDate ?? null, sourceId: t.sourceId ?? source!, projectId: t.projectId ?? null }, via);
          tasks++;
        }
      } catch (e) {
        throw new Error(`${e instanceof Error ? e.message : String(e)} (créés avant l'erreur : ${milestones} jalon(s), ${tasks} tâche(s) ; ne réessaie pas sans les retirer)`);
      }
      return `${milestones} jalon(s) et ${tasks} tâche(s) créés et liés à l'objectif`;
    }
  }
}

/** Accepting is the owner's decision: the payload is validated again, applied, then the proposal is closed. */
export async function acceptProposal(id: string, now = nowMs()): Promise<string> {
  const row = await pendingRow(id, now);
  const parsed = parsePayload(row.kind, row.payload);
  if (!parsed.ok) throw new Error(`Proposition invalide : ${parsed.error}`);
  const result = await apply(parsed.payload, row.rationale);
  await db.update(schema.proposals).set({ status: "accepted", decidedAt: new Date(now).toISOString(), result }).where(eq(schema.proposals.id, id));
  return result;
}

/** Refusing changes nothing but the proposal itself. */
export async function rejectProposal(id: string, now = nowMs()): Promise<void> {
  await pendingRow(id, now);
  await db.update(schema.proposals).set({ status: "rejected", decidedAt: new Date(now).toISOString(), result: "Refusée" }).where(eq(schema.proposals.id, id));
}
