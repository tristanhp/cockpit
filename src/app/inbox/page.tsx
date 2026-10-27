import { Suspense } from "react";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatDayShort } from "@/lib/dates";
import { pendingInbox } from "@/lib/queries";
import { Empty, PageHeader, Section } from "@/components/ui";
import { InboxActions, FileAllButton } from "@/components/inbox-actions";

export default function InboxPage() {
  return (
    <Suspense fallback={<p className="font-serif italic text-ink-faint">Ouverture du carnet…</p>}>
      <Inbox />
    </Suspense>
  );
}

async function Inbox() {
  await connection();
  const [items, sources, projects, filed] = await Promise.all([
    pendingInbox(),
    db.select().from(schema.sources).where(eq(schema.sources.role, "tasks")),
    db.select({ id: schema.projects.id, name: schema.projects.name }).from(schema.projects),
    db.select().from(schema.inbox).where(eq(schema.inbox.status, "filed")),
  ]);
  const sourceName = (id: string | null) => sources.find((s) => s.id === id)?.name ?? null;
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? null;
  const fileable = items.filter((i) => i.kind === "task" && i.suggestedSourceId).length;
  const KIND = { task: "Tâche", idea: "Idée", event: "Événement" } as const;

  return (
    <>
      <PageHeader eyebrow="avant le rangement du soir" title="Inbox" subtitle={`${items.length} capture${items.length > 1 ? "s" : ""} en attente`}>
        {fileable > 0 && <FileAllButton count={fileable} />}
      </PageHeader>

      <Section title="À ranger" count={items.length}>
        {items.length ? (
          <ul>
            {items.map((item) => (
              <li key={item.id} className="border-b border-rule py-3 last:border-b-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="smallcaps text-xs text-ink-faint">{KIND[item.kind]}</span>
                  <span className="min-w-0 flex-1">{item.title}</span>
                  {item.dueDate && (
                    <span className="font-mono text-xs tabular-nums text-ink-soft">
                      {formatDayShort(item.dueDate)}
                      {item.dueTime && ` · ${item.dueTime}`}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-faint">
                  {item.kind === "task" && (
                    <span>
                      {item.suggestedSourceId ? (
                        <>→ {sourceName(item.suggestedSourceId)}{projectName(item.suggestedProjectId) && ` · ${projectName(item.suggestedProjectId)}`}</>
                      ) : (
                        "Aucune destination suggérée"
                      )}
                    </span>
                  )}
                  {item.note && <span>{item.note}</span>}
                </div>
                <InboxActions
                  id={item.id}
                  fileable={item.kind === "task"}
                  suggestedSourceId={item.suggestedSourceId}
                  sources={sources.map((s) => ({ id: s.id, name: s.name }))}
                />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Rien à ranger. Appuie sur « c » pour capturer.</Empty>
        )}
      </Section>
      {filed.length > 0 && <p className="text-xs text-ink-faint">{filed.length} capture{filed.length > 1 ? "s" : ""} déjà rangée{filed.length > 1 ? "s" : ""}.</p>}
    </>
  );
}
