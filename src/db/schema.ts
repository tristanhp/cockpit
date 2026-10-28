import { sqliteTable, text, integer, real, index, primaryKey } from "drizzle-orm/sqlite-core";

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
  // Task type for every item of this source, and the Notion property that holds it per row.
  taskType?: string;
  taskTypeProp?: string;
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
    // Drives the learned minutes per point; null means the "default" type.
    taskType: text("task_type"),
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
    description: text("description"),
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

// Every event on a travail or perso calendar is a block; a block may be linked to a task.
export const blocks = sqliteTable(
  "blocks",
  {
    // Same as the event's id: `<calendar source id>:<external event id>`.
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    start: text("start").notNull(),
    end: text("end").notNull(),
    taskId: text("task_id"),
    status: text("status", { enum: ["proposed", "planned", "done", "missed", "replanned", "dropped"] }).notNull().default("planned"),
    origin: text("origin", { enum: ["cockpit", "calendar"] }).notNull(),
    estimateMin: integer("estimate_min"),
    // Snapshot of the task's points and type, kept because a closed task leaves the tasks table.
    effort: integer("effort"),
    taskType: text("task_type"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("blocks_start_idx").on(t.start)],
);

export const taskTypes = sqliteTable("task_types", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  minutesPerPoint: integer("minutes_per_point"),
  samples: integer("samples").notNull().default(0),
});

// Each state change and replan decision, for undo and for learning.
export const blockLog = sqliteTable("block_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: text("at").notNull(),
  blockId: text("block_id").notNull(),
  action: text("action").notNull(),
  before: text("before", { mode: "json" }).$type<unknown>(),
  after: text("after", { mode: "json" }).$type<unknown>(),
  reason: text("reason"),
});

// Single-user passkeys (WebAuthn). The public key is base64url; only a hash of a session token is stored.
export const credentials = sqliteTable("credentials", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  transports: text("transports", { mode: "json" }).$type<string[]>(),
  label: text("label"),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  hash: text("hash").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  label: text("label"),
  createdAt: text("created_at").notNull(),
});

// One row per notification actually sent: the key (kind + subject + day) makes a tick idempotent.
export const notificationsSent = sqliteTable("notifications_sent", {
  key: text("key").primaryKey(),
  kind: text("kind").notNull(),
  sentAt: text("sent_at").notNull(),
});

// Habits are data: a new one never needs code. Protected habits are never traded away.
export const habits = sqliteTable("habits", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  targetPct: integer("target_pct").notNull().default(80),
  protected: integer("protected", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// One row per habit and day, written by the clôture.
export const habitLogs = sqliteTable(
  "habit_logs",
  {
    habitId: text("habit_id").notNull(),
    day: text("day").notNull(),
    done: integer("done", { mode: "boolean" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.habitId, t.day] }), index("habit_logs_day_idx").on(t.day)],
);

// The plan of a day. `firstActionTaskId` and `top3` are what the clôture of the evening before chose
// for this day; `closedAt` and `snapshot` are written when this day itself is closed; `startedAt` is when
// "C'est parti" was pressed on the cap.
export const dayPlans = sqliteTable("day_plans", {
  day: text("day").primaryKey(),
  firstActionTaskId: text("first_action_task_id"),
  top3: text("top3", { mode: "json" }).$type<string[]>().notNull().default([]),
  closedAt: text("closed_at"),
  snapshot: text("snapshot", { mode: "json" }).$type<DaySnapshot>(),
  startedAt: text("started_at"),
  // When the one-minute catch-up of a skipped clôture was dealt with (or dismissed) on this morning.
  catchUpAt: text("catch_up_at"),
});

/** Taken at closing, to show what changed overnight. Built and compared by `src/engine/cloture.ts`. */
export type DaySnapshot = {
  from: string;
  to: string;
  tasks: { id: string; title: string; due: string | null }[];
  events: { id: string; title: string; start: string; end: string; kind: "block" | "protected" | "avoided" | "busy" }[];
  clashes: string[];
};

// Vision, year and season goals. Everything is data: a new horizon or measure needs no code.
// A single row (`id` = "main"): identity statements, the 3-5 year horizon and the rules of the system.
export const vision = sqliteTable("vision", {
  id: text("id").primaryKey(),
  identity: text("identity", { mode: "json" }).$type<string[]>().notNull().default([]),
  horizon: text("horizon").notNull().default(""),
  rules: text("rules", { mode: "json" }).$type<string[]>().notNull().default([]),
  updatedAt: text("updated_at").notNull(),
});

export const years = sqliteTable("years", {
  id: text("id").primaryKey(),
  theme: text("theme").notNull(),
  motto: text("motto"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
});

export const goals = sqliteTable(
  "goals",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    horizon: text("horizon", { enum: ["year", "season"] }).notNull(),
    yearId: text("year_id"),
    seasonId: text("season_id"),
    // A season goal can serve a year goal.
    parentGoalId: text("parent_goal_id"),
    pillarId: text("pillar_id"),
    measure: text("measure", { enum: ["milestones", "number", "habit", "boolean"] }).notNull(),
    target: real("target"),
    current: real("current"),
    unit: text("unit"),
    status: text("status", { enum: ["active", "paused", "done"] }).notNull().default("active"),
    dueDate: text("due_date"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("goals_season_idx").on(t.seasonId)],
);

// What a goal is made of. `refId` is a project, milestone, habit or task id.
export const goalLinks = sqliteTable(
  "goal_links",
  {
    goalId: text("goal_id").notNull(),
    kind: text("kind", { enum: ["project", "milestone", "habit", "task"] }).notNull(),
    refId: text("ref_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.goalId, t.kind, t.refId] })],
);

// Projects marked "hors objectifs" on purpose. Kept apart from `projects`, which a sync replaces.
export const goalExemptions = sqliteTable("goal_exemptions", {
  projectId: text("project_id").primaryKey(),
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
export type Credential = typeof credentials.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type Block = typeof blocks.$inferSelect;
export type TaskTypeRow = typeof taskTypes.$inferSelect;
export type Vision = typeof vision.$inferSelect;
export type Year = typeof years.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type GoalLink = typeof goalLinks.$inferSelect;
export type Habit = typeof habits.$inferSelect;
export type HabitLog = typeof habitLogs.$inferSelect;
export type DayPlanRow = typeof dayPlans.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type CalendarEvent = typeof events.$inferSelect;
