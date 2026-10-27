import Link from "next/link";
import { formatDayShort, formatDuration, formatTime, parisDay } from "@/lib/dates";
import { missedBlocks, nowAndNext, typeToAsk, loadSettings, type BlockView } from "@/planning";
import { Empty, Section } from "./ui";
import { BlockEndBanner } from "./block-end-banner";
import { TypeQuestion } from "./plan-block";

const timeRange = (b: BlockView) => `${formatTime(b.start)}–${formatTime(b.end)}`;

/** Maintenant: the current block and time left, then the next one. */
export async function NowStrip() {
  const [{ current, next, minutesLeft: left }, settings] = await Promise.all([nowAndNext(), loadSettings()]);
  const ask = await typeToAsk(current ?? next);
  const planned = [current, next].filter((b): b is BlockView => Boolean(b));

  return (
    <section aria-label="Maintenant" className="mb-10 border-b border-ink/80 pb-4">
      <p className="smallcaps mb-1 text-xs text-ink-faint">Maintenant</p>
      {current ? (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-serif text-2xl italic">{current.title}</span>
          <span className="font-mono text-xs tabular-nums text-ink-soft">{timeRange(current)} · reste {formatDuration(left)}</span>
          {current.task && <span className="text-xs text-ink-faint">tâche : {current.task.title}</span>}
        </div>
      ) : (
        <p className="font-serif text-xl italic text-ink-faint">Rien de planifié maintenant.</p>
      )}
      {next && (
        <p className="mt-1.5 text-sm text-ink-soft">
          Ensuite : <span className="font-mono text-xs tabular-nums">{timeRange(next)}</span> {next.title}
        </p>
      )}
      {ask && <TypeQuestion name={ask} />}
      <BlockEndBanner
        graceMin={settings.graceMin}
        blocks={planned.filter((b) => b.taskId).map((b) => ({ id: b.id, title: b.title, end: b.end, taskId: b.taskId! }))}
      />
    </section>
  );
}

/** À replacer: blocks whose time passed while their task is still open. */
export async function MissedCard() {
  const missed = await missedBlocks();
  if (!missed.length) return null;
  return (
    <Section title="À replacer" count={missed.length} aside="le temps est passé, la tâche reste ouverte">
      <ul>
        {missed.map((b) => (
          <li key={b.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule py-2.5 last:border-b-0">
            <span className="min-w-0 flex-1 truncate">{b.title}</span>
            <span className="font-mono text-xs tabular-nums text-ink-faint">{formatDayShort(parisDay(b.start))} · {timeRange(b)}</span>
            <Link href={`/?r=${encodeURIComponent(b.id)}`} scroll={false} className="rounded-md border border-rule-strong px-2.5 py-1 text-xs hover:border-accent hover:text-accent">
              Replacer
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export { Empty };
