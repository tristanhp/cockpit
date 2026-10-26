import type { ReactNode } from "react";
import type { Pillar, Source } from "@/db/schema";
import { daysFrom, formatDayCompact } from "@/lib/dates";
import type { TaskView } from "@/lib/queries";
import { PRIORITY_LABEL } from "@/engine/priority";
import { DetailLink } from "./detail-link";

export function PageHeader({ eyebrow, title, subtitle, children }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-10 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        {eyebrow && <p className="font-serif text-xl italic text-ink-soft first-letter:uppercase md:text-2xl">{eyebrow}</p>}
        <h1 className="font-serif text-4xl leading-tight tracking-tight text-balance first-letter:uppercase md:text-5xl">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}

export function Section({ title, count, aside, children }: { title: string; count?: number; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 border-b border-ink/80 pb-1">
        <h2 className="font-serif text-xl italic">
          {title}
          {count !== undefined && <span className="ml-2 font-mono text-xs not-italic text-ink-faint">{count}</span>}
        </h2>
        {aside && <div className="text-xs text-ink-faint">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** A quiet line instead of an empty box: the page simply has nothing written there. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-3 font-serif italic text-ink-faint">{children}</p>;
}

export function PillarDot({ pillar, className = "" }: { pillar: Pick<Pillar, "color" | "name"> | null; className?: string }) {
  return (
    <span
      title={pillar?.name ?? "Sans pilier"}
      className={`inline-block size-2 shrink-0 rounded-full ${className}`}
      style={{ background: pillar ? `var(--pillar-${pillar.color})` : "transparent", boxShadow: pillar ? undefined : "inset 0 0 0 1px var(--ink-faint)" }}
    />
  );
}

const KIND_LABEL: Record<Source["kind"], string> = { notion: "Notion", linear: "Linear", gcal: "Agenda" };

export function SourceTag({ source }: { source: Pick<Source, "kind"> }) {
  return <span className="smallcaps text-ink-faint">{KIND_LABEL[source.kind]}</span>;
}

export function DueLabel({ due, today, className = "" }: { due: string | null; today: string; className?: string }) {
  if (!due) return null;
  const d = daysFrom(today, due);
  const label = d === 0 ? "aujourd'hui" : d === 1 ? "demain" : d === -1 ? "hier" : formatDayCompact(due);
  const tone = d < 0 ? "text-margin" : d <= 1 ? "text-warn" : "text-ink-soft";
  return <span className={`shrink-0 whitespace-nowrap font-mono text-xs tabular-nums ${tone} ${className}`}>{label}</span>;
}

/** Linear-style priority: three bars (fewer = lower), a stamped square for Urgent, dashes for none. */
export function PriorityBars({ priority, className = "" }: { priority: number | null; className?: string }) {
  const p = priority ?? 0;
  const label = PRIORITY_LABEL[p] ?? "Aucune";
  if (p === 1)
    return (
      <svg viewBox="0 0 16 16" className={`size-4 shrink-0 text-margin ${className}`} role="img" aria-label={label}>
        <title>{label}</title>
        <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="currentColor" />
        <path d="M8 4.5v4.2M8 10.6v1" stroke="var(--paper)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  const lit = p === 0 ? 0 : 5 - p; // Haute 3, Moyenne 2, Basse 1
  return (
    <svg viewBox="0 0 16 16" className={`size-4 shrink-0 ${p === 0 ? "text-ink-faint" : "text-ink-soft"} ${className}`} role="img" aria-label={label}>
      <title>{label}</title>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={2 + i * 4.5} y={11 - i * 3.5} width="3" height={3 + i * 3.5} rx="0.8" fill="currentColor" opacity={i < lit ? 1 : 0.25} />
      ))}
    </svg>
  );
}

export function EffortChip({ effort }: { effort: number | null }) {
  if (!effort) return null;
  return (
    <span title={`${effort} point${effort > 1 ? "s" : ""} d'effort`} className="shrink-0 rounded-sm border border-rule-strong px-1 font-mono text-[11px] leading-4 text-ink-soft">
      {effort}
    </span>
  );
}

export function TaskRow({ task, today }: { task: TaskView; today: string }) {
  const triage = task.source.kind === "linear" && !task.assignedToMe;
  return (
    <li data-task-id={task.id} data-done={task.status === "done" ? "1" : "0"} className="group border-b border-rule transition-opacity last:border-b-0">
      <DetailLink param="t" id={task.id} className="flex items-start gap-3 py-2.5 hover:bg-paper-2/60">
        <PillarDot pillar={task.pillar} className="mt-[7px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 truncate">
              {task.identifier && <span className="mr-1.5 font-mono text-xs text-ink-faint">{task.identifier}</span>}
              {task.title}
            </span>
            <span className="leader" aria-hidden />
            <EffortChip effort={task.effort} />
            <PriorityBars priority={task.priority} className="self-center" />
            <DueLabel due={task.dueDate} today={today} />
          </div>
          <div className="mt-0.5 truncate text-xs text-ink-faint">
            {task.project?.name ?? task.source.name}
            {task.statusRaw && <> · {task.statusRaw}</>}
            {triage && <> · {task.assigneeName ? `assigné à ${task.assigneeName}` : "non assigné"}</>}
            {" · "}
            <SourceTag source={task.source} />
          </div>
        </div>
      </DetailLink>
    </li>
  );
}

export function TaskList({ tasks, today, empty }: { tasks: TaskView[]; today: string; empty: string }) {
  if (!tasks.length) return <Empty>{empty}</Empty>;
  return (
    <ul>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} today={today} />
      ))}
    </ul>
  );
}

export const METEO_LABEL: Record<string, string> = { "🟢": "Sur les rails", "🟡": "À surveiller", "🔴": "En retard ou bloqué" };
const METEO_TONE: Record<string, string> = { "🟢": "var(--ok)", "🟡": "var(--warn)", "🔴": "var(--margin)" };

/** Météo as an ink stamp rather than an emoji. */
export function Meteo({ value, withLabel = false }: { value: string | null; withLabel?: boolean }) {
  if (!value) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs" title={METEO_LABEL[value]} style={{ color: METEO_TONE[value] }}>
      <span className="inline-block size-2.5 rounded-full border-2" style={{ borderColor: METEO_TONE[value] }} />
      {withLabel && METEO_LABEL[value]}
    </span>
  );
}
