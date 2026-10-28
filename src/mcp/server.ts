import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createProposal } from "@/proposals";
import { priorityOf, getHabits, getInbox, getTask, getToday, getWeek, listGoals, listProjects, listTasks, proposalsList, search } from "./reads";

// Cockpit's MCP server. Everything here is read-only except the four `propose_*` tools, and those only store a
// proposal that the owner accepts or refuses in the app. Claude never writes to Notion, Linear or Google Calendar.

const INSTRUCTIONS = `Cockpit is the owner's personal life dashboard (French UI). It syncs Notion, Linear and Google Calendar.
Vocabulary: « Aujourd'hui » is the day page; a « bloc » is a calendar event on the travail or perso calendar, linked to a task; « À replacer » are blocks whose time passed while their task is still open; priorities are Urgent, Haute, Moyenne, Basse, Aucune (Linear 1 to 4, 0); « effort » is Fibonacci points (1, 2, 3, 5, 8); « le cap » is the morning ritual and « la clôture » the evening one; « la revue » is the Sunday review; « objectifs » are goals (at most three active per season) with signals « sans fil », « à l'arrêt », « sur le fil »; « habitudes » are weekly (80 % is a full week).
Read first, then propose. The read tools return compact JSON with ids and links. The propose_* tools never change anything: each stores a proposal with your short rationale, and the owner accepts or refuses it in Cockpit (« Propositions »). Tell the owner what you proposed and that it waits for their acceptance. Never claim a proposal was applied.
Times are Europe/Paris. Never invent ids: take them from the read tools.`;

const text = (value: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(value) }] });
const fail = (e: unknown): CallToolResult => ({ isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] });

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const PROPOSE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;

const rationale = z.string().min(3).max(500).describe("One short sentence in French saying why you propose this. It is shown on the card the owner reads.");
const day = z.string().describe("A date as YYYY-MM-DD.");

async function proposed(kind: string, payload: unknown, why: string): Promise<CallToolResult> {
  try {
    const { id, summary } = await createProposal(kind, payload, why);
    return text({ proposalId: id, status: "pending", willDo: summary.title, details: summary.lines, note: "Nothing has changed. The owner must accept this proposal in Cockpit (Propositions) for it to be applied." });
  } catch (e) {
    return fail(e);
  }
}

async function reading(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return text(await fn());
  } catch (e) {
    return fail(e);
  }
}

export function createCockpitMcpServer(): McpServer {
  const server = new McpServer({ name: "cockpit", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  // ---- Read tools ---------------------------------------------------------------------------------

  server.registerTool("get_today", {
    title: "Aujourd'hui",
    description:
      "Returns today's page (Aujourd'hui): the date, the current and next block (« Maintenant »), today's blocks, urgent work (tasks due today, tomorrow or late), the blocks to replace (« À replacer »), today's plan from the cap (three priorities and the première action), and how many captures wait in the inbox. Use it first when asked about the day, what to do now, or what is late. Read-only.",
    annotations: READ,
  }, () => reading(() => getToday()));

  server.registerTool("list_tasks", {
    title: "Lister les tâches",
    description:
      "Lists tasks across Notion and Linear (those that are the owner's own: Linear tickets nobody gave them are left out), most useful filters first. Each task has an id, priority (Urgent, Haute, Moyenne, Basse, Aucune), effort points, due date, project, source and a link. Defaults to open tasks. Use it to find work by project, priority or deadline; use search for a title. Read-only.",
    inputSchema: {
      status: z.enum(["open", "todo", "doing", "done"]).optional().describe("open (default) = todo and doing."),
      priority: z.union([z.string(), z.number()]).optional().describe("Urgent, Haute, Moyenne, Basse, Aucune, or 0 to 4 (Linear numbering: 1 Urgent … 4 Basse, 0 Aucune)."),
      project: z.string().optional().describe("A project id or part of its name."),
      dueBefore: day.optional().describe("Only tasks due on or before this day."),
      source: z.string().optional().describe("A source id or part of its name (e.g. a Notion base or a Linear team)."),
      limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
    },
    annotations: READ,
  }, (a) => reading(() => listTasks(a)));

  server.registerTool("get_task", {
    title: "Une tâche",
    description: "Returns one task by id with its project, pillar, linked blocks and its last five changes (and who made them: « via Claude » for accepted proposals). Use it before proposing a change to a task. Read-only.",
    inputSchema: { id: z.string().describe("A task id from list_tasks, get_today or search.") },
    annotations: READ,
  }, ({ id }) => reading(() => getTask(id)));

  server.registerTool("list_projects", {
    title: "Les projets",
    description: "Lists the projects with their priority, status (actif or en-attente), pillar, météo, next action and due date, number of open tasks, and the goals they serve. « Habitudes protégées » (protected, outside the priority scale) are never traded away. Read-only.",
    annotations: READ,
  }, () => reading(() => listProjects()));

  server.registerTool("list_goals", {
    title: "Les objectifs",
    description:
      "Returns the goals (objectifs) of the current year and season with progress, signals (« sans fil » = nothing planned in 14 days, « à l'arrêt » = a linked project has no next action, « sur le fil » = on track) and their thread: projects, milestones (jalons), tasks, habits. A season holds at most three active goals. Use it before proposing a goal breakdown. Read-only.",
    annotations: READ,
  }, () => reading(() => listGoals()));

  server.registerTool("get_week", {
    title: "La semaine",
    description:
      "Returns the blocks of a week with the point budget (planned points against the budget; the budget is the larger of a minimum and the median points done over the last four weeks). week is \"current\" (default), \"next\" or any date inside the week. Use it to see the load before proposing to move work. Read-only.",
    inputSchema: { week: z.string().optional().describe('"current", "next" or a date YYYY-MM-DD.') },
    annotations: READ,
  }, ({ week }) => reading(() => getWeek(week)));

  server.registerTool("search", {
    title: "Rechercher",
    description: "Accent-insensitive search over open task titles (and their ticket identifiers like COV-14) and project names, the same as the command palette (Ctrl K). Returns ids and links. Use it to resolve a name to an id. Read-only.",
    inputSchema: { query: z.string().min(2).describe("At least two characters.") },
    annotations: READ,
  }, ({ query }) => reading(() => search(query)));

  server.registerTool("get_habits", {
    title: "Les habitudes",
    description: "Returns the habits with this week's percentage against their target (80 % is a full week), the seven days, and whether the target was missed two weeks in a row (« jamais deux fois de suite »). Habits are ticked in the evening clôture. Read-only.",
    annotations: READ,
  }, () => reading(() => getHabits()));

  server.registerTool("get_inbox", {
    title: "L'inbox",
    description: "Returns the captures waiting to be filed (tasks, ideas, events) with their suggested destination. They are sorted in the evening clôture. Read-only.",
    annotations: READ,
  }, () => reading(() => getInbox()));

  server.registerTool("list_proposals", {
    title: "Les propositions",
    description: "Lists proposals already made (pending, accepted, rejected, expired after seven days) with their rationale and result. Use it to avoid proposing the same thing twice and to learn what the owner accepted. Read-only.",
    inputSchema: { status: z.enum(["pending", "accepted", "rejected", "expired"]).optional() },
    annotations: READ,
  }, ({ status }) => reading(() => proposalsList(status)));

  // ---- Proposal tools -----------------------------------------------------------------------------

  server.registerTool("propose_capture", {
    title: "Proposer une capture",
    description:
      "Proposes capturing something new: a task, an idea or an event. Cockpit parses French text like the owner's capture field: « Rendre le TP vendredi 18h #memoire », « idée : … », « rdv : dentiste jeudi 14h ». The task goes to the right source (Notion or Linear) only once the owner accepts. Returns a proposal id; nothing is created yet. Use it when the owner mentions something to do that is not in Cockpit yet.",
    inputSchema: {
      text: z.string().min(1).max(500).describe("The capture in French, with a date if there is one."),
      kind: z.enum(["task", "idea", "event"]).optional().describe("Default: decided from the text."),
      destination: z.string().max(80).optional().describe("A project name or tag that tells where a task belongs."),
      rationale,
    },
    annotations: PROPOSE,
  }, ({ rationale: why, ...payload }) => proposed("capture", payload, why));

  server.registerTool("propose_reschedule", {
    title: "Proposer de déplacer un bloc",
    description:
      "Proposes moving a block to another slot, keeping its length. Use it for a block in « À replacer » or one that clashes with a class, sport or an event. start is the new start as Paris local time YYYY-MM-DDTHH:mm. Cockpit refuses protected slots (cours, sport) at acceptance. Get block ids from get_today or get_week. Returns a proposal id; the block does not move until the owner accepts.",
    inputSchema: { blockId: z.string().describe("A block id."), start: z.string().describe("New start, Paris local time, YYYY-MM-DDTHH:mm."), rationale },
    annotations: PROPOSE,
  }, ({ rationale: why, ...payload }) => proposed("reschedule", payload, why));

  server.registerTool("propose_task_update", {
    title: "Proposer de modifier une tâche",
    description:
      "Proposes changing one field of a task: done (true or false), dueDate (YYYY-MM-DD, or null to clear), priority (Urgent, Haute, Moyenne, Basse, Aucune or 0 to 4) or effort (1, 2, 3, 5, 8 or null). On acceptance Cockpit writes it back to Notion or Linear and logs « via Claude » (the owner can undo it). Returns a proposal id; nothing changes until then.",
    inputSchema: {
      taskId: z.string().describe("A task id."),
      field: z.enum(["done", "dueDate", "priority", "effort"]),
      value: z.union([z.boolean(), z.string(), z.number(), z.null()]).describe("The new value for the field."),
      rationale,
    },
    annotations: PROPOSE,
  }, ({ rationale: why, taskId, field, value }) => proposed("task_update", { taskId, field, value: field === "priority" && typeof value === "string" ? (priorityOf(value) ?? value) : value }, why));

  server.registerTool("propose_goal_breakdown", {
    title: "Proposer de découper un objectif",
    description:
      "Proposes milestones (jalons, with a date) and first tasks to give a goal a thread, typically for a goal that is « sans fil ». Up to 8 milestones and 12 tasks; keep each task under two hours. Tasks are created in the owner's task source (Notion by default) and linked to the goal only once the owner accepts. Get the goal id from list_goals. Returns a proposal id.",
    inputSchema: {
      goalId: z.string().describe("A goal id from list_goals."),
      milestones: z.array(z.object({ name: z.string().max(120), date: day })).max(8).optional(),
      tasks: z.array(z.object({ title: z.string().max(200), dueDate: day.nullable().optional(), sourceId: z.string().optional().describe("A task source id; default: the Notion tasks base."), projectId: z.string().nullable().optional() })).max(12).optional(),
      rationale,
    },
    annotations: PROPOSE,
  }, ({ rationale: why, ...payload }) => proposed("goal_breakdown", payload, why));

  return server;
}
