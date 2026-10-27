import { Client, isFullPage, isFullDataSource, iteratePaginatedAPI } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client";
import type { Source, SourceConfig } from "@/db/schema";
import { EFFORTS, parsePriorityName, priorityOptionName } from "@/engine/priority";
import type { Connector, CreateResult, Discovered, NewTask, ProjectPatch, PullResult, PulledTask, TaskPatch, WriteResult } from "./types";

type PropSchema = {
  type: string;
  name: string;
  status?: { options: { id: string; name: string }[]; groups: { name: string; option_ids: string[] }[] };
  select?: { options: { id: string; name: string }[] };
};
type PropValue = { type: string } & Record<string, unknown>;

let client: Client | null = null;
function notion(): Client {
  if (!process.env.NOTION_TOKEN) throw new Error("NOTION_TOKEN manquant dans .env.local");
  client ??= new Client({ auth: process.env.NOTION_TOKEN });
  return client;
}

const plain = (rt: unknown): string =>
  Array.isArray(rt) ? rt.map((t: { plain_text?: string }) => t.plain_text ?? "").join("") : "";

function text(p: PropValue | undefined): string | null {
  if (!p) return null;
  switch (p.type) {
    case "title":
    case "rich_text":
      return plain(p[p.type]) || null;
    case "select":
    case "status":
      return (p[p.type] as { name: string } | null)?.name ?? null;
    case "url":
    case "email":
      return (p[p.type] as string | null) ?? null;
    case "number":
      return p.number == null ? null : String(p.number);
    case "formula": {
      const f = p.formula as { type: string; string?: string; number?: number };
      return f.type === "string" ? (f.string ?? null) : f.type === "number" ? String(f.number) : null;
    }
    default:
      return null;
  }
}

function dateRange(p: PropValue | undefined): { start: string | null; end: string | null } {
  const d = p?.type === "date" ? (p.date as { start: string; end: string | null } | null) : null;
  return { start: d?.start ?? null, end: d?.end ?? null };
}

/** Accepts a data source id, a database id, or a page that contains databases. */
async function resolveDataSourceId(ref: string): Promise<string> {
  const n = notion();
  try {
    return (await n.dataSources.retrieve({ data_source_id: ref })).id;
  } catch {}
  try {
    const dbRes = await n.databases.retrieve({ database_id: ref });
    if ("data_sources" in dbRes && dbRes.data_sources.length) return dbRes.data_sources[0].id;
  } catch {}
  // A page: look for the first child database, one level into columns/toggles.
  const queue: { id: string; depth: number }[] = [{ id: ref, depth: 0 }];
  while (queue.length) {
    const { id, depth } = queue.shift()!;
    for await (const block of iteratePaginatedAPI(n.blocks.children.list, { block_id: id })) {
      if (!("type" in block)) continue;
      if (block.type === "child_database") {
        const dbRes = await n.databases.retrieve({ database_id: block.id });
        if ("data_sources" in dbRes && dbRes.data_sources.length) return dbRes.data_sources[0].id;
      } else if (block.has_children && depth < 2 && block.type !== "child_page") {
        queue.push({ id: block.id, depth: depth + 1 });
      }
    }
  }
  throw new Error("Aucune base trouvée : la page est-elle partagée avec l'intégration Notion ?");
}

const findProp = (props: Record<string, PropSchema>, type: string, names: RegExp) =>
  Object.values(props).find((p) => p.type === type && names.test(p.name))?.name;
const firstOfType = (props: Record<string, PropSchema>, type: string) =>
  Object.values(props).find((p) => p.type === type)?.name;

/** Best-effort mapping from a schema; explicit values in `config` always win. */
export function guessMapping(props: Record<string, PropSchema>, config: SourceConfig): SourceConfig {
  return {
    titleProp: config.titleProp ?? firstOfType(props, "title"),
    statusProp:
      config.statusProp ??
      firstOfType(props, "status") ??
      findProp(props, "checkbox", /^(done|fait|terminé|complété?)$/i) ??
      findProp(props, "select", /^(status|statut)$/i),
    dueProp:
      config.dueProp ??
      findProp(props, "date", /^(due|date|[ée]ch[ée]ance|deadline|prochaine [ée]ch[ée]ance)$/i) ??
      firstOfType(props, "date"),
    pillarProp: config.pillarProp ?? findProp(props, "select", /^pilier$/i),
    levelProp: config.levelProp ?? findProp(props, "select", /^niveau$/i),
    meteoProp: config.meteoProp ?? findProp(props, "select", /^m[ée]t[ée]o$/i),
    nextActionProp: config.nextActionProp ?? findProp(props, "rich_text", /^prochaine action$/i),
    typeProp: config.typeProp ?? findProp(props, "select", /^type$/i),
    approxProp: config.approxProp ?? findProp(props, "checkbox", /^approximatif$/i),
    notesProp: config.notesProp ?? findProp(props, "rich_text", /^notes?$/i),
    priorityProp: config.priorityProp ?? findProp(props, "select", /^priorit[ée]$/i) ?? findProp(props, "number", /^priorit[ée]$/i),
    effortProp: config.effortProp ?? findProp(props, "number", /^(effort|points?|estimation)$/i) ?? findProp(props, "select", /^(effort|points?|estimation)$/i),
  };
}

function statusResolver(schema: PropSchema | undefined) {
  if (schema?.type === "status" && schema.status) {
    const groupOf = new Map<string, string>();
    for (const g of schema.status.groups)
      for (const id of g.option_ids) {
        const opt = schema.status.options.find((o) => o.id === id);
        if (opt) groupOf.set(opt.name, g.name.toLowerCase());
      }
    const doneNames = [...groupOf].filter(([, g]) => g.includes("complete")).map(([n]) => n);
    return {
      doneNames,
      normalize: (name: string | null): PulledTask["status"] => {
        const g = name ? groupOf.get(name) : undefined;
        return g?.includes("complete") ? "done" : g?.includes("progress") ? "doing" : "todo";
      },
    };
  }
  return {
    doneNames: [] as string[],
    normalize: (name: string | null): PulledTask["status"] =>
      name && /done|fait|termin|complet/i.test(name) ? "done" : name && /cours|progress/i.test(name) ? "doing" : "todo",
  };
}

function priorityValue(p: PropValue | undefined): number | null {
  if (p?.type === "number") return typeof p.number === "number" && p.number >= 0 && p.number <= 4 ? p.number : null;
  return parsePriorityName(text(p));
}

async function pull(source: Source): Promise<PullResult> {
  const n = notion();
  const dataSourceId = source.config.dataSourceId ?? (await resolveDataSourceId(source.externalRef));
  const ds = await n.dataSources.retrieve({ data_source_id: dataSourceId });
  if (!isFullDataSource(ds)) throw new Error("Accès partiel à la base Notion");
  const props = ds.properties as unknown as Record<string, PropSchema>;
  const map = guessMapping(props, source.config);
  const statusSchema = map.statusProp ? props[map.statusProp] : undefined;
  const status = statusResolver(statusSchema);

  // Only open tasks: completed ones are filtered at the source to keep pulls small.
  let filter: Parameters<typeof n.dataSources.query>[0]["filter"];
  if (source.role === "tasks" && map.statusProp && statusSchema) {
    if (statusSchema.type === "status" && status.doneNames.length)
      filter = { and: status.doneNames.map((name) => ({ property: map.statusProp!, status: { does_not_equal: name } })) };
    else if (statusSchema.type === "checkbox") filter = { property: map.statusProp, checkbox: { equals: false } };
  }

  const pages: PageObjectResponse[] = [];
  for await (const page of iteratePaginatedAPI(n.dataSources.query, { data_source_id: dataSourceId, filter, result_type: "page" })) {
    if (isFullPage(page)) pages.push(page);
  }

  const get = (page: PageObjectResponse, name?: string) =>
    name ? (page.properties[name] as unknown as PropValue | undefined) : undefined;
  const configPatch = { ...map, dataSourceId };

  if (source.role === "projects") {
    return {
      configPatch,
      projects: pages.map((p) => ({
        externalId: p.id,
        url: p.url,
        name: text(get(p, map.titleProp)) ?? "Sans titre",
        pillarName: text(get(p, map.pillarProp)),
        levelName: text(get(p, map.levelProp)),
        meteo: text(get(p, map.meteoProp)),
        nextAction: text(get(p, map.nextActionProp)),
        nextDue: dateRange(get(p, map.dueProp)).start,
        notes: text(get(p, map.notesProp)),
        remoteUpdatedAt: p.last_edited_time,
      })),
    };
  }

  if (source.role === "milestones") {
    return {
      configPatch,
      milestones: pages.map((p) => {
        const d = dateRange(get(p, map.dueProp));
        const approx = get(p, map.approxProp);
        return {
          externalId: p.id,
          url: p.url,
          name: text(get(p, map.titleProp)) ?? "Sans titre",
          startDate: d.start,
          endDate: d.end,
          type: text(get(p, map.typeProp)),
          approximate: approx?.type === "checkbox" ? Boolean(approx.checkbox) : false,
          notes: text(get(p, map.notesProp)),
        };
      }),
    };
  }

  if (source.role === "tasks") {
    return {
      configPatch,
      tasks: pages
        .filter((p) => !source.config.skipIfProp || !text(get(p, source.config.skipIfProp)))
        .map((p) => {
        const s = get(p, map.statusProp);
        const raw = s?.type === "checkbox" ? (s.checkbox ? "Fait" : "À faire") : text(s);
        const effort = Number(text(get(p, map.effortProp)));
        return {
          externalId: p.id,
          url: p.url,
          title: text(get(p, map.titleProp)) ?? "Sans titre",
          status: s?.type === "checkbox" ? (s.checkbox ? "done" : "todo") : status.normalize(raw),
          statusRaw: raw,
          dueDate: dateRange(get(p, map.dueProp)).start,
          projectName: source.config.projectName ?? null,
          taskType: text(get(p, source.config.taskTypeProp)) ?? source.config.taskType ?? null,
          priority: priorityValue(get(p, map.priorityProp)),
          hasPriorityProp: Boolean(map.priorityProp),
          effort: (EFFORTS as readonly number[]).includes(effort) ? effort : null,
          remoteUpdatedAt: p.last_edited_time,
        };
      }),
    };
  }

  return { configPatch };
}

/** The data source's schema and the property mapping, read fresh before a write. */
async function schemaFor(source: Source) {
  const n = notion();
  const dataSourceId = source.config.dataSourceId ?? (await resolveDataSourceId(source.externalRef));
  const ds = await n.dataSources.retrieve({ data_source_id: dataSourceId });
  if (!isFullDataSource(ds)) throw new Error("Accès partiel à la base Notion");
  const props = ds.properties as unknown as Record<string, PropSchema>;
  return { n, dataSourceId, props, map: guessMapping(props, source.config) };
}

/** First option of a status group ("to-do" or "complete"), so custom option names still work. */
function firstOptionOf(schema: PropSchema, group: "complete" | "todo"): string | null {
  const st = schema.status;
  if (!st) return null;
  const wanted = st.groups.find((g) => (group === "complete" ? /complete/i.test(g.name) : /to-?do|[àa] faire/i.test(g.name)));
  const id = wanted?.option_ids[0];
  return st.options.find((o) => o.id === id)?.name ?? null;
}

function taskProperties(props: Record<string, PropSchema>, map: SourceConfig, patch: TaskPatch) {
  const out: Record<string, unknown> = {};
  if (patch.done !== undefined) {
    const sp = map.statusProp ? props[map.statusProp] : undefined;
    if (!map.statusProp || !sp) throw new Error("Cette base Notion n'a pas de propriété de statut");
    if (sp.type === "checkbox") out[map.statusProp] = { checkbox: patch.done };
    else if (sp.type === "status") {
      const name = firstOptionOf(sp, patch.done ? "complete" : "todo");
      if (!name) throw new Error("Statut Notion introuvable pour cette action");
      out[map.statusProp] = { status: { name } };
    } else if (sp.type === "select") {
      const name = sp.select?.options.find((o) => (patch.done ? /done|fait|termin|complet/i : /to-?do|[àa] faire/i).test(o.name))?.name;
      if (!name) throw new Error("Statut Notion introuvable pour cette action");
      out[map.statusProp] = { select: { name } };
    } else throw new Error("Type de statut Notion non géré");
  }
  if (patch.dueDate !== undefined) {
    if (!map.dueProp) throw new Error("Cette base Notion n'a pas de propriété d'échéance");
    out[map.dueProp] = { date: patch.dueDate ? { start: patch.dueDate } : null };
  }
  if (patch.priority !== undefined) {
    const sp = map.priorityProp ? props[map.priorityProp] : undefined;
    if (!map.priorityProp || !sp) throw new Error("Cette base Notion n'a pas de propriété Priorité");
    if (sp.type === "number") out[map.priorityProp] = { number: patch.priority };
    else {
      const name = priorityOptionName(sp.select?.options.map((o) => o.name) ?? [], patch.priority);
      if (!name) throw new Error("Cette priorité n'existe pas dans la base Notion");
      out[map.priorityProp] = { select: { name } };
    }
  }
  if (patch.effort !== undefined) {
    const sp = map.effortProp ? props[map.effortProp] : undefined;
    if (!map.effortProp || !sp) throw new Error("Cette base Notion n'a pas de propriété Effort");
    out[map.effortProp] = sp.type === "number" ? { number: patch.effort } : { select: patch.effort === null ? null : { name: String(patch.effort) } };
  }
  return out;
}

async function updateTask(source: Source, externalId: string, patch: TaskPatch): Promise<WriteResult> {
  const { n, props, map } = await schemaFor(source);
  const properties = taskProperties(props, map, patch);
  const page = await n.pages.update({ page_id: externalId, properties: properties as never });
  const edited = "last_edited_time" in page ? page.last_edited_time : null;
  return { remoteUpdatedAt: edited, response: `pages.update ${Object.keys(properties).join(", ")}` };
}

async function updateProject(source: Source, externalId: string, patch: ProjectPatch): Promise<WriteResult> {
  const { n, props, map } = await schemaFor(source);
  const properties: Record<string, unknown> = {};
  if (patch.meteo !== undefined) {
    const sp = map.meteoProp ? props[map.meteoProp] : undefined;
    if (!map.meteoProp || !sp) throw new Error("Cette base Notion n'a pas de propriété Météo");
    properties[map.meteoProp] = sp.type === "select" ? { select: patch.meteo ? { name: patch.meteo } : null } : { rich_text: patch.meteo ? [{ text: { content: patch.meteo } }] : [] };
  }
  if (patch.nextAction !== undefined) {
    if (!map.nextActionProp) throw new Error("Cette base Notion n'a pas de propriété Prochaine action");
    properties[map.nextActionProp] = { rich_text: patch.nextAction ? [{ text: { content: patch.nextAction } }] : [] };
  }
  if (patch.nextDue !== undefined) {
    if (!map.dueProp) throw new Error("Cette base Notion n'a pas de propriété d'échéance");
    properties[map.dueProp] = { date: patch.nextDue ? { start: patch.nextDue } : null };
  }
  if (patch.priority !== undefined) {
    const sp = map.priorityProp ? props[map.priorityProp] : undefined;
    if (!map.priorityProp || !sp) throw new Error("Cette base Notion n'a pas de propriété Priorité");
    if (sp.type === "number") properties[map.priorityProp] = { number: patch.priority };
    else {
      const name = priorityOptionName(sp.select?.options.map((o) => o.name) ?? [], patch.priority);
      if (!name) throw new Error("Cette priorité n'existe pas dans la base Notion");
      properties[map.priorityProp] = { select: { name } };
    }
  }
  const page = await n.pages.update({ page_id: externalId, properties: properties as never });
  return { remoteUpdatedAt: "last_edited_time" in page ? page.last_edited_time : null, response: `pages.update ${Object.keys(properties).join(", ")}` };
}

async function createTask(source: Source, task: NewTask): Promise<CreateResult> {
  const { n, dataSourceId, props, map } = await schemaFor(source);
  if (!map.titleProp) throw new Error("Cette base Notion n'a pas de titre");
  const properties: Record<string, unknown> = {
    [map.titleProp]: { title: [{ text: { content: task.title } }] },
    ...taskProperties(props, map, {
      dueDate: task.dueDate ?? undefined,
      priority: task.priority !== undefined && map.priorityProp ? task.priority : undefined,
      effort: task.effort != null && map.effortProp ? task.effort : undefined,
    }),
  };
  const page = await n.pages.create({ parent: { type: "data_source_id", data_source_id: dataSourceId }, properties: properties as never });
  return {
    externalId: page.id,
    url: "url" in page ? page.url : null,
    remoteUpdatedAt: "last_edited_time" in page ? page.last_edited_time : null,
    response: "pages.create",
  };
}

async function discover(): Promise<Discovered[]> {
  const n = notion();
  const found: Discovered[] = [];
  let cursor: string | undefined;
  do {
    const res = await n.search({ filter: { property: "object", value: "data_source" }, start_cursor: cursor, page_size: 100 });
    for (const r of res.results) {
      if (r.object !== "data_source" || !isFullDataSource(r)) continue;
      found.push({ externalRef: r.id, name: plain(r.title) || "Base sans titre", detail: r.url });
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return found;
}

export const notionConnector: Connector = {
  kind: "notion",
  missingSetup: async () => (process.env.NOTION_TOKEN ? null : "Ajoute NOTION_TOKEN dans .env.local"),
  pull,
  discover,
  updateTask,
  updateProject,
  createTask,
  canWrite: (source, field) => Boolean(field === "priority" ? source.config.priorityProp : source.config.effortProp),
};

export { resolveDataSourceId };
