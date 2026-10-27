import Link from "next/link";
import type { ReactNode } from "react";
import { formatDayShort, formatTime, parisDay } from "@/lib/dates";
import { proposeDayReplan, replanOptions } from "@/planning";
import { ApplyDayReplan, ReplanChooser } from "./replan-actions";
import { Empty } from "./ui";

/** Bottom sheet on a phone, side panel on a desktop. */
function Sheet({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40">
      <Link href="/" scroll={false} aria-label="Fermer" className="fade-in absolute inset-0 bg-scrim backdrop-blur-md" />
      <aside
        role="dialog"
        aria-label={title}
        className="drawer-in absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col overflow-y-auto rounded-t-xl border-t border-rule bg-paper shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-full md:max-w-md md:rounded-none md:border-l md:border-t-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6">
          <div className="min-w-0">
            <p className="smallcaps font-mono text-xs text-ink-faint">{eyebrow}</p>
            <h2 className="font-serif text-2xl leading-snug text-balance">{title}</h2>
          </div>
          <Link href="/" scroll={false} className="shrink-0 rounded-md px-2 py-1 font-mono text-xs text-ink-faint hover:bg-paper-2 hover:text-ink">Fermer</Link>
        </div>
        <div className="px-6 pb-8">{children}</div>
      </aside>
    </div>
  );
}

const slot = (p: { start: number; end: number }) => `${formatDayShort(parisDay(new Date(p.start)))} · ${formatTime(new Date(p.start).toISOString())}–${formatTime(new Date(p.end).toISOString())}`;

export async function ReplanSheet({ blockId }: { blockId: string }) {
  const found = await replanOptions(blockId);
  if (!found) return <Sheet title="Bloc introuvable" eyebrow="À replacer"><Empty>Il a peut-être été supprimé de l&apos;agenda.</Empty></Sheet>;
  return (
    <Sheet title={found.block.title} eyebrow="Replacer ce bloc">
      <ReplanChooser
        blockId={blockId}
        options={found.options.map((o) => ({ key: o.key, label: o.label, note: o.note ?? null, slots: o.placements.map(slot) }))}
      />
    </Sheet>
  );
}

export async function DayReplanSheet() {
  const plan = await proposeDayReplan();
  const { moved, kept, dropped, unplaceable } = plan.result;
  const when = (m: { start: number; end: number }) => `${formatTime(new Date(m.start).toISOString())}–${formatTime(new Date(m.end).toISOString())}`;
  const nothing = !moved.length && !dropped.length && !unplaceable.length;
  return (
    <Sheet title="Replanifier ma journée" eyebrow="Avant / après">
      {plan.before.length === 0 ? (
        <Empty>Aucun bloc à replanifier aujourd&apos;hui.</Empty>
      ) : (
        <ul className="divide-y divide-rule text-sm">
          {kept.map((k) => (
            <li key={k.blockId} className="py-2.5">
              <span className="block">{k.title}</span>
              <span className="font-mono text-xs text-ink-faint">{when(k.at)} · inchangé</span>
            </li>
          ))}
          {moved.map((m) => (
            <li key={m.blockId} className="py-2.5">
              <span className="block">{m.title}</span>
              <span className="font-mono text-xs text-ink-soft">
                {when(m.from)} → {m.day === "later" ? slot(m.to) : when(m.to)}
              </span>
              <span className="block text-xs text-ink-faint">{m.reason}</span>
            </li>
          ))}
          {dropped.map((d) => (
            <li key={d.blockId} className="py-2.5 text-ink-soft">
              <span className="block line-through">{d.title}</span>
              <span className="text-xs text-warn">retiré du plan : {d.reason}</span>
            </li>
          ))}
          {unplaceable.map((u) => (
            <li key={u.blockId} className="py-2.5">
              <span className="block">{u.title}</span>
              <span className="text-xs text-margin">{u.mandatory ? "obligatoire, " : ""}{u.reason}</span>
            </li>
          ))}
        </ul>
      )}
      <ApplyDayReplan disabled={nothing} />
    </Sheet>
  );
}
