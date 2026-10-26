import { addDays } from "@/lib/dates";
import { fold } from "@/lib/text";

// Linear numbering: 0 Aucune, 1 Urgent, 2 Haute, 3 Moyenne, 4 Basse.
export type Priority = 0 | 1 | 2 | 3 | 4;

export const PRIORITY_LABEL: Record<number, string> = { 0: "Aucune", 1: "Urgent", 2: "Haute", 3: "Moyenne", 4: "Basse" };
export const EFFORTS = [1, 2, 3, 5, 8] as const;

export const isPriority = (n: unknown): n is Priority => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 4;
export const isEffort = (n: unknown): n is (typeof EFFORTS)[number] => EFFORTS.includes(n as never);

/** "Haute", "haute", "P2"… as written in a Notion select. Null when the name is not a priority. */
export function parsePriorityName(name: string | null | undefined): Priority | null {
  if (!name) return null;
  const n = fold(name).trim().replace(/^[^a-z0-9]+/, "");
  if (/^(urgent|urgente|critique|p0|p1)\b/.test(n)) return 1;
  if (/^(haute|high|elevee|importante|p2)\b/.test(n)) return 2;
  if (/^(moyenne|medium|normale|p3)\b/.test(n)) return 3;
  if (/^(basse|low|faible|p4)\b/.test(n)) return 4;
  if (/^(aucune|none|sans|no priority)\b/.test(n)) return 0;
  return null;
}

/** Finds the select option matching a priority, so a write uses the base's own spelling. */
export function priorityOptionName(options: string[], priority: number): string | null {
  return options.find((o) => parsePriorityName(o) === priority) ?? null;
}

export type ProjectScale = { priority: Priority | null; status: "actif" | "en-attente"; protected: boolean };

/** The old levels, folded into the new scale while the level property still exists. */
export function projectScaleFromLevel(levelName: string | null | undefined): ProjectScale {
  const n = fold(levelName ?? "").trim();
  if (n === "socle") return { priority: null, status: "actif", protected: true };
  if (n === "en attente") return { priority: 3, status: "en-attente", protected: false };
  if (n === "p1") return { priority: 2, status: "actif", protected: false };
  if (n === "p2") return { priority: 3, status: "actif", protected: false };
  if (n === "maintenance") return { priority: 4, status: "actif", protected: false };
  return { priority: 0, status: "actif", protected: false };
}

export type PriorityInput = {
  sourceKind: "notion" | "linear";
  /** Priority written in the source: Linear's own, or a Notion `Priorité` value. Null when the row has none. */
  sourcePriority: number | null;
  /** True when the Notion base has a priority property at all (an empty cell then means "Aucune"). */
  sourceHasProperty?: boolean;
  projectPriority: number | null;
  dueDate: string | null;
  today: string;
  /** A graded deliverable (a source flag). */
  graded?: boolean;
  /** The user set `sourcePriority` in Cockpit: it is final, no deadline raise. */
  locked?: boolean;
};

export type PriorityResult = { priority: Priority; auto: boolean };

/**
 * Rules, in order: Linear uses Linear's priority; a Notion row uses its Priorité
 * property when the base has one; otherwise inherit the project's; then raise to
 * Urgent when a graded deliverable or an item on a Haute project is due within 48 h.
 */
export function computePriority(i: PriorityInput): PriorityResult {
  if (i.locked && isPriority(i.sourcePriority)) return { priority: i.sourcePriority, auto: false };
  let priority: Priority;
  let auto = false;
  if (i.sourceKind === "linear") {
    priority = isPriority(i.sourcePriority) ? i.sourcePriority : 0;
  } else if (i.sourceHasProperty) {
    priority = isPriority(i.sourcePriority) ? i.sourcePriority : 0;
  } else {
    priority = isPriority(i.projectPriority) ? i.projectPriority : 0;
    auto = true;
  }
  const soon = i.dueDate !== null && i.dueDate <= addDays(i.today, 2);
  const onHaute = i.projectPriority === 2;
  if (soon && (i.graded || onHaute) && priority !== 1) return { priority: 1, auto: true };
  return { priority, auto };
}
