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
  priority?: number | null;
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

export interface Connector {
  kind: Source["kind"];
  /** Human-readable reason the connector cannot run, or null if it is configured. */
  missingSetup(): Promise<string | null>;
  pull(source: Source): Promise<PullResult>;
  /** Lists everything this tool exposes, so new projects/calendars can be suggested. */
  discover(): Promise<Discovered[]>;
}
