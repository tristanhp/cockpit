import { Client, isFullPage, isFullDataSource, iteratePaginatedAPI } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client";
import type { Source, SourceConfig } from "@/db/schema";
import type { Connector, Discovered, PullResult, PulledTask } from "./types";

type PropSchema = { type: string; name: string; status?: { options: { id: string; name: string }[]; groups: { name: string; option_ids: string[] }[] } };
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
      tasks: pages.map((p) => {
        const s = get(p, map.statusProp);
        const raw = s?.type === "checkbox" ? (s.checkbox ? "Fait" : "À faire") : text(s);
        return {
          externalId: p.id,
          url: p.url,
          title: text(get(p, map.titleProp)) ?? "Sans titre",
          status: s?.type === "checkbox" ? (s.checkbox ? "done" : "todo") : status.normalize(raw),
          statusRaw: raw,
          dueDate: dateRange(get(p, map.dueProp)).start,
          projectName: source.config.projectName ?? null,
          remoteUpdatedAt: p.last_edited_time,
        };
      }),
    };
  }

  return { configPatch };
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
};

export { resolveDataSourceId };
