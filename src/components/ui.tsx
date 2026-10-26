import type { ReactNode } from "react";
import type { Pillar, Source } from "@/db/schema";
import { daysFrom, formatDayShort } from "@/lib/dates";
import type { TaskView } from "@/lib/queries";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight first-letter:uppercase">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}

export function Section({ title, count, children, aside }: { title: string; count?: number; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
          {title}
          {count !== undefined && <span className="ml-2 text-faint">{count}</span>}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-border bg-surface ${className}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-faint">{children}</p>;
}

export function PillarDot({ pillar }: { pillar: Pick<Pillar, "color" | "name"> | null }) {
  return (
    <span
      title={pillar?.name ?? "Sans pilier"}
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ background: pillar ? `var(--pillar-${pillar.color})` : "var(--border)" }}
    />
  );
}

const KIND_LABEL: Record<Source["kind"], string> = { notion: "Notion", linear: "Linear", gcal: "Agenda" };

export function SourceBadge({ source }: { source: Source }) {
  return (
    <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-faint">
      {KIND_LABEL[source.kind]}
    </span>
  );
}

export function DueLabel({ due, today }: { due: string | null; today: string }) {
  if (!due) return null;
  const d = daysFrom(today, due);
  const label = d === 0 ? "aujourd'hui" : d === 1 ? "demain" : d === -1 ? "hier" : formatDayShort(due);
  const tone = d < 0 ? "text-danger" : d <= 1 ? "text-warn" : "text-muted";
  return <span className={`shrink-0 text-xs tabular-nums ${tone}`}>{label}</span>;
}

export function TaskRow({ task, today }: { task: TaskView; today: string }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <PillarDot pillar={task.pillar} />
      <div className="min-w-0 flex-1">
        <a href={task.url ?? undefined} target="_blank" rel="noreferrer" className="block truncate text-sm hover:underline">
          {task.identifier && <span className="mr-1.5 font-mono text-xs text-faint">{task.identifier}</span>}
          {task.title}
        </a>
        <div className="truncate text-xs text-faint">
          {task.project?.name ?? task.source.name}
          {task.statusRaw && <> · {task.statusRaw}</>}
          {task.source.kind === "linear" && !task.assignedToMe && (
            <> · {task.assigneeName ? `assigné à ${task.assigneeName}` : "non assigné"}</>
          )}
        </div>
      </div>
      <DueLabel due={task.dueDate} today={today} />
      <SourceBadge source={task.source} />
    </li>
  );
}

export function TaskList({ tasks, today, empty }: { tasks: TaskView[]; today: string; empty: string }) {
  if (!tasks.length) return <Empty>{empty}</Empty>;
  return (
    <Card>
      <ul className="divide-y divide-border">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} today={today} />
        ))}
      </ul>
    </Card>
  );
}

export const METEO_LABEL: Record<string, string> = { "🟢": "Sur les rails", "🟡": "À surveiller", "🔴": "En retard / bloqué" };
