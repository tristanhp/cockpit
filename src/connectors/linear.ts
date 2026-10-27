import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Source } from "@/db/schema";
import type { Connector, CreateResult, Discovered, NewTask, PullResult, TaskPatch, WriteResult } from "./types";

async function gql<T>(query: string, variables: Record<string, unknown> = {}, keyEnv = "LINEAR_API_KEY"): Promise<T> {
  const key = process.env[keyEnv];
  if (!key) throw new Error(`${keyEnv} manquant dans .env.local`);
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: key },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || body.errors?.length) throw new Error(body.errors?.[0]?.message ?? `Linear HTTP ${res.status}`);
  return body.data!;
}

type IssueNode = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  dueDate: string | null;
  priority: number;
  estimate: number | null;
  updatedAt: string;
  state: { name: string; type: string };
  assignee: { id: string; name: string } | null;
  project: { name: string } | null;
};

const ISSUES = `
query($teamKey: String!, $after: String) {
  viewer { id }
  issues(first: 100, after: $after, filter: {
    team: { key: { eq: $teamKey } },
    state: { type: { nin: ["completed", "canceled"] } }
  }) {
    nodes { id identifier title url dueDate priority estimate updatedAt
      state { name type } assignee { id name } project { name } }
    pageInfo { hasNextPage endCursor }
  }
}`;

async function pull(source: Source): Promise<PullResult> {
  const teamKey = source.config.teamKey ?? source.externalRef;
  const nodes: IssueNode[] = [];
  let viewerId = "";
  let after: string | null = null;
  do {
    const data: {
      viewer: { id: string };
      issues: { nodes: IssueNode[]; pageInfo: { hasNextPage: boolean; endCursor: string } };
    } = await gql(ISSUES, { teamKey, after }, source.config.apiKeyEnv);
    viewerId = data.viewer.id;
    nodes.push(...data.issues.nodes);
    after = data.issues.pageInfo.hasNextPage ? data.issues.pageInfo.endCursor : null;
  } while (after);

  const projectMap = source.config.projectMap ?? {};
  return {
    tasks: nodes.map((i) => ({
      externalId: i.id,
      identifier: i.identifier,
      url: i.url,
      title: i.title,
      status: i.state.type === "started" ? "doing" : "todo",
      statusRaw: i.state.name,
      dueDate: i.dueDate,
      projectName: i.project ? (projectMap[i.project.name] ?? source.config.projectName ?? i.project.name) : (source.config.projectName ?? null),
      assignedToMe: i.assignee ? i.assignee.id === viewerId : false,
      assigneeName: i.assignee?.name ?? null,
      priority: i.priority,
      effort: i.estimate,
      taskType: source.config.taskType ?? null,
      remoteUpdatedAt: i.updatedAt,
    })),
  };
}

type State = NonNullable<Source["config"]["workflowStates"]>[number];

/** The team's workflow states, read once and cached in the source's config. */
async function statesFor(source: Source): Promise<State[]> {
  if (source.config.workflowStates?.length) return source.config.workflowStates;
  const data = await gql<{ teams: { nodes: { states: { nodes: State[] } }[] } }>(
    `query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { states { nodes { id name type position } } } } }`,
    { key: source.config.teamKey ?? source.externalRef },
    source.config.apiKeyEnv,
  );
  const states = data.teams.nodes[0]?.states.nodes;
  if (!states?.length) throw new Error("États Linear introuvables pour cette équipe");
  await db.update(schema.sources).set({ config: { ...source.config, workflowStates: states } }).where(eq(schema.sources.id, source.id));
  return states;
}

const firstOf = (states: State[], type: string) => [...states].filter((s) => s.type === type).sort((a, b) => a.position - b.position)[0];

async function updateTask(source: Source, externalId: string, patch: TaskPatch): Promise<WriteResult> {
  const input: Record<string, unknown> = {};
  if (patch.done !== undefined) {
    const states = await statesFor(source);
    const target = patch.done ? firstOf(states, "completed") : firstOf(states, "unstarted");
    if (!target) throw new Error("État Linear introuvable pour cette action");
    input.stateId = target.id;
  }
  if (patch.dueDate !== undefined) input.dueDate = patch.dueDate;
  if (patch.priority !== undefined) input.priority = patch.priority;
  if (patch.effort !== undefined) input.estimate = patch.effort;
  const data = await gql<{ issueUpdate: { success: boolean; issue: { updatedAt: string } | null } }>(
    `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { updatedAt } } }`,
    { id: externalId, input },
    source.config.apiKeyEnv,
  );
  if (!data.issueUpdate.success) throw new Error("Linear a refusé la modification");
  return { remoteUpdatedAt: data.issueUpdate.issue?.updatedAt ?? null, response: `issueUpdate ${Object.keys(input).join(", ")}` };
}

async function createTask(source: Source, task: NewTask): Promise<CreateResult> {
  const key = source.config.teamKey ?? source.externalRef;
  const teams = await gql<{ teams: { nodes: { id: string }[] } }>(
    `query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id } } }`,
    { key },
    source.config.apiKeyEnv,
  );
  const teamId = teams.teams.nodes[0]?.id;
  if (!teamId) throw new Error("Équipe Linear introuvable");
  const input: Record<string, unknown> = { teamId, title: task.title };
  if (task.dueDate) input.dueDate = task.dueDate;
  if (task.priority !== undefined) input.priority = task.priority;
  if (task.effort != null) input.estimate = task.effort;
  const data = await gql<{ issueCreate: { success: boolean; issue: { id: string; identifier: string; url: string; updatedAt: string } | null } }>(
    `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url updatedAt } } }`,
    { input },
    source.config.apiKeyEnv,
  );
  const issue = data.issueCreate.issue;
  if (!data.issueCreate.success || !issue) throw new Error("Linear a refusé la création");
  return { externalId: issue.id, identifier: issue.identifier, url: issue.url, remoteUpdatedAt: issue.updatedAt, response: "issueCreate" };
}

async function discover(): Promise<Discovered[]> {
  const data = await gql<{ teams: { nodes: { key: string; name: string }[] } }>(`{ teams { nodes { key name } } }`);
  return data.teams.nodes.map((t) => ({ externalRef: t.key, name: `Linear · ${t.name}`, detail: t.key }));
}

export const linearConnector: Connector = {
  kind: "linear",
  missingSetup: async () => (process.env.LINEAR_API_KEY ? null : "Ajoute LINEAR_API_KEY dans .env.local"),
  pull,
  discover,
  updateTask,
  createTask,
  canWrite: () => true,
};
