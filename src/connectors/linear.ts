import type { Source } from "@/db/schema";
import type { Connector, Discovered, PullResult } from "./types";

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const key = process.env.LINEAR_API_KEY;
  if (!key) throw new Error("LINEAR_API_KEY manquant dans .env.local");
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
    nodes { id identifier title url dueDate priority updatedAt
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
    } = await gql(ISSUES, { teamKey, after });
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
      projectName: i.project ? (projectMap[i.project.name] ?? i.project.name) : null,
      assignedToMe: i.assignee ? i.assignee.id === viewerId : false,
      assigneeName: i.assignee?.name ?? null,
      priority: i.priority || null,
      remoteUpdatedAt: i.updatedAt,
    })),
  };
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
};
