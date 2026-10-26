import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { parisDay } from "@/lib/dates";
import { loadContext, needsTriage, openTasks, type TaskView } from "@/lib/queries";
import { PageHeader, PillarDot, Section, TaskList } from "@/components/ui";

type Group = "pilier" | "source" | "echeance";

export default function TasksPage(props: PageProps<"/taches">) {
  return (
    <Suspense fallback={<p className="text-sm text-faint">Chargement…</p>}>
      <Tasks {...props} />
    </Suspense>
  );
}

async function Tasks({ searchParams }: PageProps<"/taches">) {
  await connection();
  const sp = await searchParams;
  const group = (["pilier", "source", "echeance"].includes(String(sp.par)) ? sp.par : "pilier") as Group;
  const today = parisDay();
  const [all, ctx] = await Promise.all([openTasks(), loadContext()]);
  const tasks = sp.trier === "1" ? all.filter(needsTriage) : all.filter((t) => !needsTriage(t));

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
      ["7 prochains jours", (t) => !!t.dueDate && t.dueDate >= today && t.dueDate <= addWeek(today)],
      ["Plus tard", (t) => !!t.dueDate && t.dueDate > addWeek(today)],
      ["Sans échéance", (t) => !t.dueDate],
    ];
    for (const [title, test] of buckets) groups.push({ key: title, title, items: tasks.filter(test) });
  }

  const link = (params: Record<string, string>) => `/taches?${new URLSearchParams({ par: group, ...(sp.trier === "1" ? { trier: "1" } : {}), ...params })}`;
  const tab = (active: boolean) => `rounded-md px-2.5 py-1 ${active ? "bg-surface-2 text-text" : "text-muted hover:text-text"}`;

  return (
    <>
      <PageHeader title="Tâches" subtitle={`${tasks.length} tâches ouvertes, toutes sources confondues`} />
      <div className="mb-6 flex flex-wrap gap-4 text-sm">
        <div className="flex gap-1">
          <span className="py-1 text-faint">Grouper par</span>
          {(["pilier", "source", "echeance"] as const).map((g) => (
            <Link key={g} href={link({ par: g })} className={tab(group === g)}>
              {{ pilier: "pilier", source: "source", echeance: "échéance" }[g]}
            </Link>
          ))}
        </div>
        <div className="flex gap-1">
          <Link href={`/taches?par=${group}`} className={tab(sp.trier !== "1")}>Mes tâches</Link>
          <Link href={`/taches?par=${group}&trier=1`} className={tab(sp.trier === "1")}>
            Linear à trier ({all.filter(needsTriage).length})
          </Link>
        </div>
      </div>

      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <Section key={g.key} title={g.title} count={g.items.length} aside={g.pillar ? <PillarDot pillar={g.pillar} /> : undefined}>
            <TaskList tasks={g.items} today={today} empty="" />
          </Section>
        ))}
      {!tasks.length && <p className="text-sm text-faint">Aucune tâche. Lance une synchronisation depuis « Aujourd&apos;hui ».</p>}
    </>
  );
}

function addWeek(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}
