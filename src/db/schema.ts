import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// Everything that shapes the system (piliers, niveaux, saisons, sources) is data,
// so that a new project, semester or tool never requires a code change.

export const pillars = sqliteTable("pillars", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
});

export const levels = sqliteTable("levels", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  weeklyRule: text("weekly_rule"),
  maxProjects: integer("max_projects"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const seasons = sqliteTable("seasons", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  notes: text("notes"),
});

// A source is one place data comes from: a Notion data source, a Linear team,
// a Google calendar. `config` holds the field mapping and routing hints.
export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["notion", "linear", "gcal"] }).notNull(),
  role: text("role", {
    enum: ["tasks", "projects", "milestones", "reviews", "events"],
  }).notNull(),
  name: text("name").notNull(),
  externalRef: text("external_ref").notNull(),
  config: text("config", { mode: "json" }).$type<SourceConfig>().notNull().default({}),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastSyncAt: text("last_sync_at"),
  lastSyncError: text("last_sync_error"),
  lastSyncCount: integer("last_sync_count"),
});

export type SourceConfig = {
  // Notion: resolved data source id and property names
  dataSourceId?: string;
  titleProp?: string;
  statusProp?: string;
  dueProp?: string;
  // Notion projects / milestones
  pillarProp?: string;
  levelProp?: string;
  meteoProp?: string;
  nextActionProp?: string;
  typeProp?: string;
  approxProp?: string;
  notesProp?: string;
  // Default Cockpit project for every item of this source
  projectName?: string;
  // Notion tasks: skip rows where this property is filled (e.g. a "Linear" link,
  // when the same ticket already comes from Linear directly).
  skipIfProp?: string;
  // Linear: team key and Linear project name -> Cockpit project name.
  // apiKeyEnv names the env var holding the key, one per Linear workspace.
  teamKey?: string;
  projectMap?: Record<string, string>;
  apiKeyEnv?: string;
  // Google Calendar: what the calendar means in the planning
  calendarRole?: "travail" | "perso" | "socle" | "cours" | "engagement";
  color?: string;
  // Notion tasks: optional `Priorité` and `Effort` properties (guessed from the schema when absent).
  priorityProp?: string;
  effortProp?: string;
  // Course deliverables carry a grade: due within 48 h they are always Urgent.
  graded?: boolean;
  // Linear: the team's workflow states, read once and cached here.
  workflowStates?: { id: string; name: string; type: string; position: number }[];
};

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  sourceId: text("source_id"),
  externalId: text("external_id"),
  url: text("url"),
  name: text("name").notNull(),
  pillarId: text("pillar_id"),
  levelId: text("level_id"),
  meteo: text("meteo"),
  nextAction: text("next_action"),
  nextDue: text("next_due"),
  notes: text("notes"),
  // Linear numbering (0 none … 4 low); null while the project is protected.
  priority: integer("priority"),
  status: text("status", { enum: ["actif", "en-attente"] }).notNull().default("actif"),
  // Protected habits (the old Socle level) sit outside the priority scale.
  protected: integer("protected", { mode: "boolean" }).notNull().default(false),
  // Set once priority or status is edited in Cockpit, so a sync keeps the edit.
  priorityManual: integer("priority_manual", { mode: "boolean" }).notNull().default(false),
  remoteUpdatedAt: text("remote_updated_at"),
  syncedAt: text("synced_at"),
});

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    externalId: text("external_id").notNull(),
    identifier: text("identifier"),
    url: text("url"),
    title: text("title").notNull(),
    status: text("status", { enum: ["todo", "doing", "done"] }).notNull(),
    statusRaw: text("status_raw"),
    dueDate: text("due_date"),
    projectId: text("project_id"),
    assignedToMe: integer("assigned_to_me", { mode: "boolean" }),
    assigneeName: text("assignee_name"),
    // Effective priority, Linear numbering: 0 Aucune, 1 Urgent, 2 Haute, 3 Moyenne, 4 Basse.
    priority: integer("priority"),
    // True when the priority was derived (project, deadline) rather than set at the source.
    priorityAuto: integer("priority_auto", { mode: "boolean" }).notNull().default(false),
    // Fibonacci points: 1, 2, 3, 5, 8.
    effort: integer("effort"),
    remoteUpdatedAt: text("remote_updated_at"),
    syncedAt: text("synced_at").notNull(),
  },
  (t) => [index("tasks_due_idx").on(t.dueDate), index("tasks_source_idx").on(t.sourceId)],
);

export const milestones = sqliteTable("milestones", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  externalId: text("external_id").notNull(),
  url: text("url"),
  name: text("name").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  type: text("type"),
  approximate: integer("approximate", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  syncedAt: text("synced_at").notNull(),
});

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    externalId: text("external_id").notNull(),
    url: text("url"),
    title: text("title").notNull(),
    start: text("start").notNull(),
    end: text("end").notNull(),
    allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
    day: text("day").notNull(),
    isExam: integer("is_exam", { mode: "boolean" }).notNull().default(false),
    syncedAt: text("synced_at").notNull(),
  },
  (t) => [index("events_day_idx").on(t.day)],
);

// Sources found in connected tools but not registered yet.
export const discoveries = sqliteTable("discoveries", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["notion", "linear", "gcal"] }).notNull(),
  externalRef: text("external_ref").notNull(),
  name: text("name").notNull(),
  detail: text("detail"),
  dismissed: integer("dismissed", { mode: "boolean" }).notNull().default(false),
  foundAt: text("found_at").notNull(),
});

// Cockpit-only values that survive syncs: a priority or effort the source has no
// property for, and the Linear triage choices.
export const taskOverrides = sqliteTable("task_overrides", {
  taskId: text("task_id").primaryKey(),
  priority: integer("priority"),
  effort: integer("effort"),
  // "Pas pour moi": hidden from À trier for good.
  hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
  // "Me concerne": stays in Mes tâches without reassigning in Linear.
  mine: integer("mine", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull(),
});

// Every write, so that it can be listed and undone. `before`/`after` are JSON.
export const changeLog = sqliteTable(
  "change_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    at: text("at").notNull(),
    entity: text("entity", { enum: ["task", "project"] }).notNull(),
    entityId: text("entity_id").notNull(),
    label: text("label").notNull(),
    field: text("field").notNull(),
    before: text("before", { mode: "json" }).$type<unknown>(),
    after: text("after", { mode: "json" }).$type<unknown>(),
    // The source id, "cockpit" for Cockpit-only data, "sync" for a conflict.
    source: text("source").notNull(),
    response: text("response"),
    undone: integer("undone", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("change_log_at_idx").on(t.at)],
);

// Quick captures waiting to be filed.
export const inbox = sqliteTable("inbox", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  kind: text("kind", { enum: ["task", "idea", "event"] }).notNull(),
  title: text("title").notNull(),
  dueDate: text("due_date"),
  dueTime: text("due_time"),
  suggestedSourceId: text("suggested_source_id"),
  suggestedProjectId: text("suggested_project_id"),
  note: text("note"),
  status: text("status", { enum: ["pending", "filed", "dismissed"] }).notNull().default("pending"),
  createdAt: text("created_at").notNull(),
});

// pattern (a keyword, a #tag, or `re:<regex>`) -> destination source and project.
export const routingRules = sqliteTable("routing_rules", {
  id: text("id").primaryKey(),
  pattern: text("pattern").notNull(),
  sourceId: text("source_id").notNull(),
  projectId: text("project_id"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>(),
});

export type Source = typeof sources.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Pillar = typeof pillars.$inferSelect;
export type TaskOverride = typeof taskOverrides.$inferSelect;
export type ChangeLogEntry = typeof changeLog.$inferSelect;
export type InboxItem = typeof inbox.$inferSelect;
export type RoutingRule = typeof routingRules.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type CalendarEvent = typeof events.$inferSelect;
