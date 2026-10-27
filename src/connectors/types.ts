import type { Source } from "@/db/schema";

// What a connector hands back to the sync engine. Each array is the complete
// current state of that source: anything missing from it is removed locally.
export type PulledTask = {
  externalId: string;
  identifier?: string | null;
  url?: string | null;
  title: string;
  status: "todo" | "doing" | "done";
  statusRaw?: string | null;
  dueDate?: string | null;
  projectName?: string | null;
  assignedToMe?: boolean | null;
  assigneeName?: string | null;
  /** Priority written in the source (Linear's, or a Notion Priorité value). */
  priority?: number | null;
  /** True when the Notion base has a priority property, even if this row's cell is empty. */
  hasPriorityProp?: boolean;
  effort?: number | null;
  taskType?: string | null;
  remoteUpdatedAt?: string | null;
};

export type PulledProject = {
  externalId: string;
  url?: string | null;
  name: string;
  pillarName?: string | null;
  levelName?: string | null;
  meteo?: string | null;
  nextAction?: string | null;
  nextDue?: string | null;
  notes?: string | null;
  remoteUpdatedAt?: string | null;
};

export type PulledMilestone = {
  externalId: string;
  url?: string | null;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  type?: string | null;
  approximate?: boolean;
  notes?: string | null;
};

export type PulledEvent = {
  externalId: string;
  url?: string | null;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  isExam?: boolean;
  description?: string | null;
};

export type PullResult = {
  tasks?: PulledTask[];
  projects?: PulledProject[];
  milestones?: PulledMilestone[];
  events?: PulledEvent[];
  // Connectors may learn things while pulling (e.g. a resolved Notion data source id).
  configPatch?: Partial<Source["config"]>;
};

export type Discovered = { externalRef: string; name: string; detail?: string };

/** A change to one task, as the source understands it. Only the keys present are written. */
export type TaskPatch = {
  done?: boolean;
  dueDate?: string | null;
  priority?: number;
  effort?: number | null;
};

export type ProjectPatch = {
  meteo?: string | null;
  nextAction?: string | null;
  nextDue?: string | null;
  priority?: number;
  status?: "actif" | "en-attente";
};

export type NewTask = {
  title: string;
  dueDate?: string | null;
  priority?: number;
  effort?: number | null;
  projectName?: string | null;
};

/** What a write returns: the source's own edit time and a short trace for the change log. */
export type WriteResult = { remoteUpdatedAt: string | null; response: string; newState?: { raw: string; status: "todo" | "doing" | "done" } };
export type CreateResult = { externalId: string; identifier?: string | null; url?: string | null; remoteUpdatedAt: string | null; response: string };

export interface Connector {
  kind: Source["kind"];
  /** Human-readable reason the connector cannot run, or null if it is configured. */
  missingSetup(): Promise<string | null>;
  pull(source: Source): Promise<PullResult>;
  /** Lists everything this tool exposes, so new projects/calendars can be suggested. */
  discover(): Promise<Discovered[]>;
  /** Write-back. Callers go through `src/writeback`, which checks demo mode first. */
  updateTask?(source: Source, externalId: string, patch: TaskPatch): Promise<WriteResult>;
  updateProject?(source: Source, externalId: string, patch: ProjectPatch): Promise<WriteResult>;
  createTask?(source: Source, task: NewTask): Promise<CreateResult>;
  /** Whether this source has a property for the field, or must keep it Cockpit-side. */
  canWrite?(source: Source, field: "priority" | "effort"): boolean;
}
