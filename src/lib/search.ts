import { db, schema } from "@/db";
import { openTasks } from "@/lib/queries";
import { fold } from "@/lib/text";

export type SearchHit = { id: string; kind: "task" | "project"; label: string; hint?: string; href: string };

/** Accent-insensitive search over open tasks and projects: the command palette and the MCP `search` tool share it. */
export async function searchAll(query: string): Promise<SearchHit[]> {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const [tasks, projects] = await Promise.all([openTasks(), db.select().from(schema.projects)]);
  const taskHits = tasks
    .filter((t) => fold(`${t.identifier ?? ""} ${t.title}`).includes(q))
    .slice(0, 8)
    .map((t) => ({ id: t.id, kind: "task" as const, label: t.title, hint: t.project?.name ?? t.source.name, href: `/taches?t=${encodeURIComponent(t.id)}` }));
  const projectHits = projects
    .filter((p) => fold(p.name).includes(q))
    .slice(0, 5)
    .map((p) => ({ id: p.id, kind: "project" as const, label: p.name, hint: p.meteo ?? undefined, href: `/objectifs?vue=projets&p=${encodeURIComponent(p.id)}` }));
  return [...projectHits, ...taskHits];
}
