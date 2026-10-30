// Drives the MCP server in demo mode, end to end:
//   npm run demo:setup && COCKPIT_DEMO=1 DATABASE_URL=file:data/demo.db npm run mcp:check
// It spawns the stdio server (or talks to a running one with `--http <url>` and COCKPIT_MCP_TOKEN), lists the tools,
// calls every read tool, creates one proposal of each kind, then accepts, refuses and expires proposals through the
// same functions the app's server actions call, and checks what changed and what did not.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createRequire } from "node:module";
import { db, schema } from "@/db";
import { addDays, parisDay } from "@/lib/dates";
import { acceptProposal, expirePending, listProposals, rejectProposal } from "@/proposals";

const { eq } = createRequire(`${process.cwd()}/package.json`)("drizzle-orm");

if (process.env.COCKPIT_DEMO !== "1") {
  console.error("Demo only: set COCKPIT_DEMO=1 (and DATABASE_URL=file:data/demo.db). This script must never touch real accounts.");
  process.exit(2);
}

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
};

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- tool output is untyped JSON

async function main() {
  const httpUrl = process.argv.includes("--http") ? process.argv[process.argv.indexOf("--http") + 1] : null;
  const transport = httpUrl
    ? new StreamableHTTPClientTransport(new URL(httpUrl), { requestInit: { headers: { Authorization: `Bearer ${process.env.COCKPIT_MCP_TOKEN ?? ""}` } } })
    : new StdioClientTransport({ command: "npx", args: ["tsx", "scripts/mcp-stdio.ts"], env: { ...(process.env as Record<string, string>) }, stderr: "inherit" });
  const client = new Client({ name: "cockpit-demo-check", version: "1.0.0" });
  await client.connect(transport);

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { type: string; text: string }[] };
    const body = res.content[0]?.text ?? "";
    let data: Json = {};
    try {
      data = JSON.parse(body);
    } catch {
      data = { message: body };
    }
    return { isError: Boolean(res.isError), data };
  };
  const counts = async () => ({
    tasks: (await db.select().from(schema.tasks)).length,
    blocks: JSON.stringify((await db.select().from(schema.blocks)).map((b) => [b.id, b.start, b.status])),
    log: (await db.select().from(schema.changeLog)).length,
    milestones: (await db.select().from(schema.milestones)).length,
    links: (await db.select().from(schema.goalLinks)).length,
    inbox: (await db.select().from(schema.inbox)).length,
  });

  console.log("Tools");
  const tools = (await client.listTools()).tools;
  const names = tools.map((t) => t.name).sort();
  const READS = ["get_today", "list_tasks", "get_task", "list_projects", "list_goals", "get_week", "search", "get_habits", "get_inbox", "list_proposals"];
  const PROPOSES = ["propose_capture", "propose_reschedule", "propose_task_update", "propose_goal_breakdown"];
  check(names.length === READS.length + PROPOSES.length, `${names.length} tools`, names.join(", "));
  check([...READS, ...PROPOSES].every((n) => names.includes(n)), "every expected tool is listed");
  check(tools.every((t) => (t.description ?? "").length > 80), "every tool has a real description for the model");
  check(READS.every((n) => tools.find((t) => t.name === n)?.annotations?.readOnlyHint === true), "read tools are marked read-only");

  console.log("Read tools");
  const today = await call("get_today");
  check(!today.isError && Boolean(today.data.day) && Array.isArray(today.data.blocks), "get_today", `${today.data.day}, ${today.data.blocks?.length} blocs, ${today.data.urgent?.length} urgent`);
  const open = await call("list_tasks", { limit: 20 });
  check(!open.isError && open.data.tasks.length > 0, "list_tasks (open)", `${open.data.count} tâches`);
  check(!(await call("list_tasks", { priority: "Haute", dueBefore: addDays(parisDay(), 30) })).isError, "list_tasks filtered by priority and due date");
  check((await call("list_tasks", { priority: "Nimportequoi" })).isError, "list_tasks refuses an unknown priority");
  const taskId: string = open.data.tasks.find((t: Json) => t.priority !== "Urgent")?.id ?? open.data.tasks[0].id;
  const task = await call("get_task", { id: taskId });
  check(!task.isError && task.data.id === taskId, "get_task", task.data.title);
  check((await call("get_task", { id: "nope" })).isError, "get_task reports an unknown id");
  const projects = await call("list_projects");
  check(!projects.isError && projects.data.projects.length > 0, "list_projects", `${projects.data.projects.length}`);
  const goals = await call("list_goals");
  check(!goals.isError && goals.data.seasonGoals.length > 0, "list_goals", `${goals.data.seasonGoals.length} objectifs de saison`);
  const week = await call("get_week", { week: "current" });
  check(!week.isError && week.data.points.budget > 0, "get_week", `budget ${week.data.points.budget}, ${week.data.blocks.length} blocs`);
  check(!(await call("get_week", { week: "next" })).isError, "get_week next");
  const found = await call("search", { query: "kubernetes" });
  check(!found.isError && found.data.hits.length > 0, "search is accent-insensitive", found.data.hits?.[0]?.label);
  check(!found.isError && (await call("search", { query: "KUBERNÉTÈS" })).data.hits.length > 0, "search ignores accents and case");
  check(!(await call("get_habits")).isError, "get_habits");
  check(!(await call("get_inbox")).isError, "get_inbox");
  check(!(await call("list_proposals")).isError, "list_proposals");

  console.log("Proposals change nothing");
  const before = await counts();
  const goalId: string = goals.data.seasonGoals.find((g: Json) => g.signals.includes("sans fil"))?.id ?? goals.data.seasonGoals[0].id;
  const future = (await call("get_week", { week: "next" })).data.blocks.find((b: Json) => ["planned", "proposed"].includes(b.status));
  const blockId: string = future?.id ?? (week.data.blocks.find((b: Json) => b.status === "planned" && b.start > `${parisDay()} 23:59`)?.id as string);
  const slot = `${addDays(parisDay(), 4)}T16:00`;
  const p = {
    capture: await call("propose_capture", { text: "Appeler le garage vendredi", kind: "task", destination: "Admin", rationale: "Tu l'as mentionné pendant qu'on regardait la semaine" }),
    reschedule: await call("propose_reschedule", { blockId, start: slot, rationale: "Ce bloc chevauche un autre engagement" }),
    update: await call("propose_task_update", { taskId, field: "priority", value: "Haute", rationale: "L'échéance approche et rien n'est prévu" }),
    breakdown: await call("propose_goal_breakdown", {
      goalId,
      milestones: [{ name: "Plan des sorties validé", date: addDays(parisDay(), 10) }],
      tasks: [{ title: "Choisir la sortie du week-end", dueDate: addDays(parisDay(), 3) }, { title: "Préparer le ravitaillement", dueDate: addDays(parisDay(), 5) }],
      rationale: "Aucun travail n'est prévu pour cet objectif dans les 14 jours",
    }),
  };
  for (const [kind, r] of Object.entries(p)) check(!r.isError && r.data.status === "pending" && String(r.data.proposalId).startsWith("prop-"), `propose ${kind}`, r.data.willDo ?? r.data.message);
  const after = await counts();
  check(JSON.stringify(before) === JSON.stringify(after), "creating four proposals changed no task, block, milestone, link, inbox item or log entry");
  check((await call("propose_task_update", { taskId, field: "priority", value: 9, rationale: "test de validation" })).isError, "an invalid payload is refused");
  check((await call("propose_reschedule", { blockId: "inconnu", start: slot, rationale: "test de validation" })).isError, "an unknown block is refused");
  check((await call("propose_capture", { text: "x", rationale: "" })).isError, "a proposal without a rationale is refused");

  console.log("Accepting applies the change, through the app's own write paths");
  const id = (k: keyof typeof p) => p[k].data.proposalId as string;
  let result = await acceptProposal(id("capture"));
  const createLog = (await db.select().from(schema.changeLog)).filter((c) => c.field === "create" && c.label.includes("garage"));
  check(createLog.length === 1 && createLog[0].via === "Claude", "capture accepted: the task is created and the log says via Claude", result);
  result = await acceptProposal(id("update"));
  const updated = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) });
  const updateLog = (await db.select().from(schema.changeLog)).find((c) => c.entityId === taskId && c.field === "priority" && c.via === "Claude");
  check(updated?.priority === 2 && Boolean(updateLog), "task update accepted: priority is Haute and the log says via Claude", result);
  const moved = await acceptProposal(id("reschedule"));
  const block = await db.query.blocks.findFirst({ where: eq(schema.blocks.id, blockId) });
  check(Boolean(block) && parisDay(block!.start) === addDays(parisDay(), 4), "reschedule accepted: the block moved", moved);
  const linksBefore = (await db.select().from(schema.goalLinks)).length;
  result = await acceptProposal(id("breakdown"));
  check((await db.select().from(schema.goalLinks)).length === linksBefore + 3, "breakdown accepted: one milestone and two tasks created and linked", result);
  check((await db.select().from(schema.changeLog)).filter((c) => c.via === "Claude").length >= 4, "the change log records via Claude");
  try {
    await acceptProposal(id("capture"));
    check(false, "accepting twice is refused");
  } catch (e) {
    check(true, "accepting twice is refused", (e as Error).message);
  }
  check((await listProposals({ status: "accepted" })).length >= 4, "accepted proposals are listed");

  console.log("Refused and expired proposals change nothing");
  const refused = await call("propose_task_update", { taskId, field: "done", value: true, rationale: "Elle a l'air terminée" });
  const baseline = await counts();
  await rejectProposal(refused.data.proposalId);
  check(JSON.stringify(baseline) === JSON.stringify(await counts()), "a refused proposal changed nothing");
  check((await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) }))?.status !== "done", "the task is still open");
  try {
    await acceptProposal(refused.data.proposalId);
    check(false, "a refused proposal cannot be accepted");
  } catch (e) {
    check(true, "a refused proposal cannot be accepted", (e as Error).message);
  }
  const stale = await call("propose_task_update", { taskId, field: "done", value: true, rationale: "Proposition ancienne" });
  await db.update(schema.proposals).set({ createdAt: new Date(Date.now() - 8 * 86_400_000).toISOString() }).where(eq(schema.proposals.id, stale.data.proposalId));
  const frozen = await counts();
  check((await expirePending()) >= 1, "a proposal older than seven days expires");
  try {
    await acceptProposal(stale.data.proposalId);
    check(false, "an expired proposal cannot be accepted");
  } catch (e) {
    check(true, "an expired proposal cannot be accepted", (e as Error).message);
  }
  check(JSON.stringify(frozen) === JSON.stringify(await counts()), "an expired proposal changed nothing");
  check((await listProposals({ status: "expired" })).some((x) => x.id === stale.data.proposalId), "it is listed as expired");

  await client.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
