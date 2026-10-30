import { z } from "zod";
import { PRIORITY_LABEL } from "@/engine/priority";
import { formatDayCompact, formatDayShort, parisDay } from "@/lib/dates";

// What a proposal may contain, per kind. Validated when Claude creates it and again when the owner accepts it,
// so a stored payload is never trusted. Pure: no database here.

export const PROPOSAL_KINDS = ["capture", "reschedule", "task_update", "goal_breakdown"] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date attendue au format AAAA-MM-JJ");
const slot = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "créneau attendu au format AAAA-MM-JJTHH:mm (heure de Paris)");
const id = z.string().trim().min(1).max(200);

export const rationaleSchema = z.string().trim().min(3, "Explique en une phrase pourquoi").max(500);

export const captureSchema = z.object({
  text: z.string().trim().min(1).max(500),
  kind: z.enum(["task", "idea", "event"]).optional(),
  destination: z.string().trim().min(1).max(80).optional(),
});

export const rescheduleSchema = z.object({ blockId: id, start: slot });

export const taskUpdateSchema = z.discriminatedUnion("field", [
  z.object({ taskId: id, field: z.literal("done"), value: z.boolean() }),
  z.object({ taskId: id, field: z.literal("dueDate"), value: day.nullable() }),
  z.object({ taskId: id, field: z.literal("priority"), value: z.number().int().min(0).max(4) }),
  z.object({ taskId: id, field: z.literal("effort"), value: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(8)]).nullable() }),
]);

export const breakdownSchema = z
  .object({
    goalId: id,
    milestones: z.array(z.object({ name: z.string().trim().min(1).max(120), date: day })).max(8).default([]),
    tasks: z
      .array(z.object({ title: z.string().trim().min(1).max(200), dueDate: day.nullable().optional(), sourceId: id.optional(), projectId: id.nullable().optional() }))
      .max(12)
      .default([]),
  })
  .refine((v) => v.milestones.length + v.tasks.length > 0, { message: "Propose au moins un jalon ou une tâche" });

export type CapturePayload = z.infer<typeof captureSchema>;
export type ReschedulePayload = z.infer<typeof rescheduleSchema>;
export type TaskUpdatePayload = z.infer<typeof taskUpdateSchema>;
export type BreakdownPayload = z.infer<typeof breakdownSchema>;
export type Payload = { kind: "capture"; data: CapturePayload } | { kind: "reschedule"; data: ReschedulePayload } | { kind: "task_update"; data: TaskUpdatePayload } | { kind: "goal_breakdown"; data: BreakdownPayload };

const SCHEMAS = { capture: captureSchema, reschedule: rescheduleSchema, task_update: taskUpdateSchema, goal_breakdown: breakdownSchema } as const;

const where = (path: PropertyKey[]) => (path.length ? `${path.join(".")} : ` : "");

/** Validates a stored or incoming payload for its kind. The error is French and says which field is wrong. */
export function parsePayload(kind: string, payload: unknown): { ok: true; payload: Payload } | { ok: false; error: string } {
  if (!(kind in SCHEMAS)) return { ok: false, error: `Type de proposition inconnu : ${kind}` };
  const parsed = SCHEMAS[kind as ProposalKind].safeParse(payload);
  if (parsed.success) return { ok: true, payload: { kind, data: parsed.data } as Payload };
  return { ok: false, error: parsed.error.issues.map((i) => `${where(i.path)}${i.message}`).join(" ; ") };
}

// ---- What the card says ------------------------------------------------------------------------------

/** Names the card needs, looked up by the caller. */
export type Names = { task?: string; block?: { title: string; start: string }; goal?: string };

export type Summary = { title: string; lines: string[] };

const slotLabel = (local: string) => `${formatDayShort(local.slice(0, 10))} ${local.slice(11, 16)}`;
const isoSlot = (iso: string) => `${formatDayShort(parisDay(iso))} ${new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(iso))}`;

/** The exact change, in French: "Déplacer le bloc X de mar. 14:00 à mer. 09:00". */
export function summarize(p: Payload, names: Names = {}): Summary {
  switch (p.kind) {
    case "capture": {
      const kind = p.data.kind === "idea" ? "l'idée" : p.data.kind === "event" ? "l'événement" : "la tâche";
      return { title: `Capturer ${kind} « ${p.data.text} »`, lines: p.data.destination ? [`Destination suggérée : ${p.data.destination}`] : [] };
    }
    case "reschedule": {
      const name = names.block?.title ?? p.data.blockId;
      return { title: `Déplacer le bloc « ${name} » ${names.block ? `de ${isoSlot(names.block.start)} ` : ""}à ${slotLabel(p.data.start)}`, lines: [] };
    }
    case "task_update": {
      const name = names.task ?? p.data.taskId;
      switch (p.data.field) {
        case "done":
          return { title: p.data.value ? `Marquer « ${name} » comme terminée` : `Rouvrir « ${name} »`, lines: [] };
        case "dueDate":
          return { title: p.data.value ? `Mettre l'échéance de « ${name} » au ${formatDayCompact(p.data.value)}` : `Retirer l'échéance de « ${name} »`, lines: [] };
        case "priority":
          return { title: `Passer « ${name} » en priorité ${PRIORITY_LABEL[p.data.value]}`, lines: [] };
        case "effort":
          return { title: p.data.value === null ? `Retirer l'effort de « ${name} »` : `Fixer l'effort de « ${name} » à ${p.data.value} point${p.data.value > 1 ? "s" : ""}`, lines: [] };
      }
    }
    case "goal_breakdown": {
      const m = p.data.milestones.length;
      const t = p.data.tasks.length;
      const parts = [m ? `${m} jalon${m > 1 ? "s" : ""}` : null, t ? `${t} tâche${t > 1 ? "s" : ""}` : null].filter(Boolean).join(" et ");
      return {
        title: `Découper « ${names.goal ?? p.data.goalId} » : ${parts}`,
        lines: [...p.data.milestones.map((x) => `Jalon · ${x.name} · ${formatDayCompact(x.date)}`), ...p.data.tasks.map((x) => `Tâche · ${x.title}${x.dueDate ? ` · ${formatDayCompact(x.dueDate)}` : ""}`)],
      };
    }
  }
}

export const EXPIRY_DAYS = 7;

/** A pending proposal older than seven days has expired. */
export const isExpired = (createdAt: string, now: number): boolean => now - Date.parse(createdAt) > EXPIRY_DAYS * 86_400_000;
