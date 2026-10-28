import { formatDayCompact, formatTime, nowMs } from "@/lib/dates";
import { capData } from "@/rituals";
import { CapActions, CatchUp } from "./cap-card";

const range = (b: { start: string; end: string }) => `${formatTime(b.start)}–${formatTime(b.end)}`;
const dueLabel = (d: string | null) => (d ? formatDayCompact(d) : "sans date");

/** Le cap: from the cap time until C'est parti. Catch-up first when yesterday's clôture was skipped. */
export async function Cap() {
  const cap = await capData(nowMs());
  if (!cap.visible && !cap.catchUp) return null;
  const { diff } = cap;
  const changes = diff
    ? [
        ...diff.newTasks.map((t) => `Nouveau : ${t.title}`),
        ...diff.changedTasks.map((t) => `Échéance changée : ${t.title} (${dueLabel(t.from)} → ${dueLabel(t.to)})`),
        ...diff.movedEvents.map((e) => `Déplacé : ${e.title} (${range(e.from)} → ${range(e.to)})`),
        ...diff.newEvents.map((e) => `Ajouté à l'agenda : ${e.title} (${range(e)})`),
        ...diff.newClashes.map((c) => `Chevauchement : « ${c.block} » sur « ${c.event} »`),
      ]
    : [];

  return (
    <>
      {cap.catchUp && <CatchUp leftovers={cap.catchUp.leftovers} inbox={cap.catchUp.inbox} />}
      {cap.visible && (
        <section aria-label="Le cap" className="mb-10 rounded-md border border-rule-strong bg-paper-2/40 p-5">
          <p className="smallcaps mb-1 text-xs text-ink-faint">Le cap · {cap.capTime}</p>
          {cap.firstAction ? (
            <p className="font-serif text-2xl italic">
              <span className="mr-2 text-base not-italic text-ink-faint">Première action</span>
              {cap.firstAction.title}
            </p>
          ) : (
            <p className="font-serif text-xl italic text-ink-faint">Aucune action urgente : choisis ce qui compte.</p>
          )}
          {cap.suggestedOnly && cap.top3.length > 0 && <p className="mt-1 text-xs text-ink-faint">Proposé ce matin : pas de plan préparé hier soir.</p>}

          {cap.top3.length > 0 && (
            <ol className="mt-4">
              {cap.top3.map((t, i) => (
                <li key={t.id} className="flex items-baseline gap-3 border-b border-rule py-2 last:border-b-0">
                  <span className="font-mono text-xs text-ink-faint">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-ink-soft">{t.block ? range(t.block) : "pas de bloc"}</span>
                </li>
              ))}
            </ol>
          )}

          {changes.length > 0 && (
            <div className="mt-5">
              <h3 className="font-serif text-lg italic">Depuis hier soir</h3>
              <ul className="mt-1 text-sm text-ink-soft">
                {changes.map((c) => (
                  <li key={c} className="py-0.5">· {c}</li>
                ))}
              </ul>
            </div>
          )}

          <CapActions top3={cap.top3.map((t) => ({ id: t.id, title: t.title }))} firstId={cap.firstAction?.id ?? null} pool={cap.pool} />
        </section>
      )}
    </>
  );
}
