import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { addDays, formatDayShort, formatTime, isoWeek, isoWeekday, nowMs, parisDay } from "@/lib/dates";
import { blocksBetween } from "@/planning";
import { reviewView } from "@/review";
import { load } from "@/engine/week";
import { Empty, PageHeader } from "@/components/ui";
import { ProposalBlockActions } from "@/components/proposal-actions";

export default function WeekPage(props: PageProps<"/semaine">) {
  return (
    <Suspense fallback={<p className="font-serif italic text-ink-faint">Ouverture du carnet…</p>}>
      <Week {...props} />
    </Suspense>
  );
}

const STATUS: Record<string, string> = { proposed: "proposé", planned: "prévu", done: "fait", missed: "à replacer", replanned: "replacé", dropped: "abandonné" };
const tab = (active: boolean) => `whitespace-nowrap border-b-2 pb-1 ${active ? "border-accent text-ink" : "border-transparent text-ink-faint hover:text-ink"}`;

async function Week({ searchParams }: PageProps<"/semaine">) {
  await connection();
  const sp = await searchParams;
  const today = parisDay();
  const next = sp.sem === "prochaine";
  const view = await reviewView(nowMs(), { create: false });
  const monday = next ? view.nextWeek : view.weekStart;
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const blocks = await blocksBetween(days[0], days[6]);
  const proposal = view.proposal && view.proposal.weekStart === monday ? view.proposal : null;
  const locked = Boolean(view.review.data.confirmedAt);

  const planned = blocks.filter((b) => b.status !== "dropped").reduce((n, b) => n + (b.effort ?? 0), 0);
  const proposed = proposal && !locked ? proposal.blocks.filter((b) => !b.excluded).reduce((n, b) => n + b.points, 0) : 0;
  const total = planned + proposed;
  const budget = view.budget.budget;
  const l = load(total, budget);
  const pct = Math.min(100, Math.round((total / Math.max(budget, 1)) * 100));

  return (
    <>
      <PageHeader eyebrow={`semaine ${isoWeek(monday)}`} title="Semaine" subtitle={`${blocks.length} bloc${blocks.length > 1 ? "s" : ""}${proposal && !locked ? ` + ${proposal.blocks.filter((b) => !b.excluded).length} proposés` : ""}`}>
        <Link href="/revue" className="rounded-md border border-rule-strong px-3 py-1.5 text-sm hover:border-accent hover:text-accent">La revue</Link>
      </PageHeader>

      <div className="mb-6 flex items-center gap-6 text-sm">
        <Link href="/semaine" className={tab(!next)}>Cette semaine</Link>
        <Link href="/semaine?sem=prochaine" className={tab(next)}>La suivante</Link>
      </div>

      <div className="mb-8">
        <div className="mb-1 flex items-baseline justify-between text-xs text-ink-faint">
          <span>Budget de points</span>
          <span className={`font-mono tabular-nums ${l.over ? "text-warn" : "text-ink-soft"}`}>{total} / {budget}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-rule" role="img" aria-label={`${total} points sur ${budget}`}>
          <div className={`h-full ${l.over ? "bg-warn" : "bg-accent"}`} style={{ width: `${pct}%` }} />
        </div>
        {l.message && <p className="mt-2 text-xs text-warn">{l.message}</p>}
      </div>

      <div className="grid gap-x-4 gap-y-6 lg:grid-cols-7">
        {days.map((day) => {
          const list = blocks.filter((b) => parisDay(b.start) === day);
          const ahead = proposal && !locked ? proposal.blocks.filter((b) => parisDay(new Date(b.start)) === day) : [];
          return (
            <section key={day} className="min-w-0">
              <h2 className={`mb-1 border-b pb-1 font-serif text-lg italic ${day === today ? "border-accent" : "border-ink/80"}`}>
                {formatDayShort(day)}
              </h2>
              {list.length === 0 && ahead.length === 0 ? (
                <Empty>{isoWeekday(day) === 7 ? "Jamais de blocs." : "—"}</Empty>
              ) : (
                <ul className="grid gap-1.5">
                  {list.map((b) => (
                    <li key={b.id} className="rounded-sm border border-rule px-2 py-1.5 text-sm">
                      <span className="block font-mono text-[11px] tabular-nums text-ink-faint">{formatTime(b.start)}–{formatTime(b.end)}</span>
                      <span className="block truncate">{b.title}</span>
                      <span className={`text-xs ${b.status === "missed" ? "text-margin" : "text-ink-faint"}`}>{STATUS[b.status]}{b.effort ? ` · ${b.effort} pt${b.effort > 1 ? "s" : ""}` : ""}</span>
                    </li>
                  ))}
                  {ahead.map((b) => (
                    <li key={b.key} className={`rounded-sm border border-dashed border-accent/60 px-2 py-1.5 text-sm ${b.excluded ? "opacity-50" : ""}`}>
                      <span className="block font-mono text-[11px] tabular-nums text-ink-faint">{formatTime(new Date(b.start).toISOString())}–{formatTime(new Date(b.end).toISOString())}</span>
                      <span className={`block truncate ${b.excluded ? "line-through" : ""}`}>{b.title}</span>
                      <span className="mb-1 block text-xs text-accent">proposé{b.points ? ` · ${b.points} pt${b.points > 1 ? "s" : ""}` : ""}</span>
                      <ProposalBlockActions weekStart={view.weekStart} blockKey={b.key} excluded={Boolean(b.excluded)} locked={locked} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      {next && !proposal && <p className="mt-6 text-sm text-ink-soft">Aucune proposition pour cette semaine : elle se prépare à l&apos;étape 5 de <Link href="/revue" className="underline decoration-rule-strong underline-offset-4 hover:decoration-accent">la revue</Link>.</p>}
    </>
  );
}
