import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { addDays, parisDay } from "@/lib/dates";
import { loadContext, needsTriage, openTasks, pendingInbox, type TaskView } from "@/lib/queries";
import { PageHeader, PillarDot, Section, TaskList } from "@/components/ui";
import { DetailPanel } from "@/components/detail-panel";

type Group = "pilier" | "source" | "echeance";
const GROUP_LABEL: Record<Group, string> = { pilier: "pilier", source: "source", echeance: "échéance" };

export default function TasksPage(props: PageProps<"/taches">) {
  return (
    <Suspense fallback={<p className="font-serif italic text-ink-faint">Ouverture du carnet…</p>}>
      <Tasks {...props} />
    </Suspense>
  );
}

async function Tasks({ searchParams }: PageProps<"/taches">) {
  await connection();
  const sp = await searchParams;
  const group = (["pilier", "source", "echeance"].includes(String(sp.par)) ? sp.par : "pilier") as Group;
  const triageView = sp.trier === "1";
  const today = parisDay();
  const [all, ctx, inbox] = await Promise.all([openTasks(), loadContext(), pendingInbox()]);
  const tasks = triageView ? all.filter(needsTriage) : all.filter((t) => !needsTriage(t));

  const groups: { key: string; title: string; pillar?: (typeof ctx.pillars)[number]; items: TaskView[] }[] = [];
  if (group === "pilier") {
    for (const p of ctx.pillars) groups.push({ key: p.id, title: p.name, pillar: p, items: tasks.filter((t) => t.pillar?.id === p.id) });
    groups.push({ key: "none", title: "Sans pilier", items: tasks.filter((t) => !t.pillar) });
  } else if (group === "source") {
    for (const s of ctx.sources.filter((s) => s.enabled && s.role === "tasks"))
      groups.push({ key: s.id, title: s.name, items: tasks.filter((t) => t.sourceId === s.id) });
  } else {
    const buckets: [string, (t: TaskView) => boolean][] = [
      ["En retard", (t) => !!t.dueDate && t.dueDate < today],
      ["Sept prochains jours", (t) => !!t.dueDate && t.dueDate >= today && t.dueDate <= addDays(today, 7)],
      ["Plus tard", (t) => !!t.dueDate && t.dueDate > addDays(today, 7)],
      ["Sans échéance", (t) => !t.dueDate],
    ];
    for (const [title, test] of buckets) groups.push({ key: title, title, items: tasks.filter(test) });
  }

  const href = (par: Group, trier: boolean) => `/taches?${new URLSearchParams({ par, ...(trier ? { trier: "1" } : {}) })}`;
  const tab = (active: boolean) =>
    `whitespace-nowrap border-b-2 pb-1 ${active ? "border-accent text-ink" : "border-transparent text-ink-faint hover:text-ink"}`;

  return (
    <>
      <PageHeader eyebrow="toutes sources confondues" title="Tâches" subtitle={`${tasks.length} tâche${tasks.length > 1 ? "s" : ""} ouverte${tasks.length > 1 ? "s" : ""}`} />

      <div className="mb-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
        <div className="flex items-center gap-4">
          <span className="font-serif italic text-ink-faint">par</span>
          {(Object.keys(GROUP_LABEL) as Group[]).map((g) => (
            <Link key={g} href={href(g, triageView)} className={tab(group === g)}>{GROUP_LABEL[g]}</Link>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <Link href={href(group, false)} className={tab(!triageView)}>Mes tâches</Link>
          <Link href={href(group, true)} className={tab(triageView)}>Linear à trier · {all.filter(needsTriage).length}</Link>
          <Link href="/inbox" className={tab(false)}>Inbox · {inbox.length}</Link>
        </div>
      </div>

      <div className="grid gap-x-14 xl:grid-cols-2">
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <div key={g.key} className="min-w-0">
              <Section title={g.title} count={g.items.length} aside={g.pillar ? <PillarDot pillar={g.pillar} /> : undefined}>
                <TaskList tasks={g.items} today={today} empty="" />
              </Section>
            </div>
          ))}
      </div>
      {!tasks.length && <p className="font-serif italic text-ink-faint">Aucune tâche ici. Lance une synchronisation depuis « Aujourd&apos;hui ».</p>}

      <DetailPanel sp={sp} path="/taches" />
    </>
  );
}
