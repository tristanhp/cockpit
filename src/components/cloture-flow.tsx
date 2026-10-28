"use client";

import { useState, useTransition } from "react";
import { capture, closeDayAction, setInboxDue, fileEverything } from "@/app/actions";
import { PRIORITY_LABEL } from "@/engine/priority";
import { formatDayShort } from "@/lib/dates";
import type { ClotureData } from "@/rituals";
import { notify } from "./feedback";
import { InboxActions } from "./inbox-actions";
import { LeftoverList } from "./leftovers";

const STEPS = ["Bilan", "Restes", "Inbox", "Demain", "Rien d'oublié ?"] as const;
const primary = "rounded-md bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50";
const ghost = "rounded-md border border-rule-strong px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-50";
const field = "rounded-md border border-rule-strong bg-paper px-3 py-2 text-sm placeholder:text-ink-faint focus:border-accent focus:outline-none";

export function ClotureFlow({ data }: { data: ClotureData }) {
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const [daily, setDaily] = useState<{ result: "V" | "N" | "D"; goalsFor: number; goalsAgainst: number } | null>(null);
  const [pending, start] = useTransition();
  // The priorities and ticks stay `null` until touched, so a suggestion that changes after "Restes" is followed.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [firstPicked, setFirstPicked] = useState<string | null>(null);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [text, setText] = useState("");
  const [captured, setCaptured] = useState<string[]>([]);

  const top3 = picked ?? data.suggested;
  const first = firstPicked && top3.includes(firstPicked) ? firstPicked : top3.includes(data.firstAction ?? "") ? data.firstAction : (top3[0] ?? null);
  const habitDone = (id: string, initial: boolean) => ticks[id] ?? initial;

  const toggleTop = (id: string) => setPicked(top3.includes(id) ? top3.filter((x) => x !== id) : top3.length < 3 ? [...top3, id] : top3);

  const addCapture = () =>
    start(async () => {
      const res = await capture(text);
      if (!res.ok) return notify(res.error, "error");
      setCaptured((c) => [...c, text.trim()]);
      setText("");
      notify(res.message);
    });

  const close = () =>
    start(async () => {
      const res = await closeDayAction({ top3, firstActionTaskId: first, habits: Object.fromEntries(data.habits.map((h) => [h.id, habitDone(h.id, h.done)])) });
      if (!res.ok) return notify(res.error, "error");
      setDaily(res.daily ?? null);
      setFinished(true);
    });

  if (finished)
    return (
      <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-paper px-8 text-center">
        <p className="font-serif text-4xl italic leading-snug text-balance md:text-5xl">Écrans off.</p>
        <p className="mt-3 font-serif text-2xl italic text-ink-soft md:text-3xl">Le carnet papier t&apos;attend.</p>
        {daily && <p className="mt-10 font-mono text-sm text-ink-faint">{{ V: "Victoire", N: "Match nul", D: "Défaite" }[daily.result]} · {daily.goalsFor}–{daily.goalsAgainst}</p>}
      </div>
    );

  return (
    <div className="max-w-2xl">
      <ol className="mb-8 grid grid-cols-5 gap-2" aria-label="Progression">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined}>
            <div className={`h-1 rounded-full ${i <= step ? "bg-accent" : "bg-rule-strong"}`} />
            <p className={`mt-1.5 truncate text-xs ${i === step ? "text-ink" : "text-ink-faint"}`}>
              <span className="font-mono">{i + 1}</span> {label}
            </p>
          </li>
        ))}
      </ol>

      {data.late && <p className="mb-6 border-l-2 border-warn pl-4 text-sm text-ink-soft">Il est tard (après {data.settings.hardStop}). Tu peux finir, mais dépêche-toi : demain compte.</p>}
      {data.closed && <p className="mb-6 text-xs text-ink-faint">La journée est déjà close. Tu peux la refaire : le plan de demain sera remplacé.</p>}

      {step === 0 && (
        <section>
          <h2 className="mb-3 font-serif text-2xl italic">Bilan</h2>
          <dl className="grid grid-cols-3 gap-4 border-y border-rule py-4">
            <Stat label="Blocs tenus" value={`${data.bilan.blocksKept} / ${data.bilan.blocksPlanned}`} />
            <Stat label="Tâches faites" value={String(data.bilan.tasksDone)} />
            <Stat label="Points d'effort" value={String(data.bilan.points)} />
          </dl>
          <p className="mt-3 text-sm text-ink-soft">Rien à faire ici : juste regarder.</p>
        </section>
      )}

      {step === 1 && (
        <section>
          <h2 className="mb-1 font-serif text-2xl italic">Restes</h2>
          <p className="mb-2 text-sm text-ink-soft">Ce qui n&apos;a pas eu lieu. Un tap, et Cockpit replace.</p>
          <LeftoverList items={data.leftovers} empty="Rien à replacer. Journée propre." />
        </section>
      )}

      {step === 2 && (
        <section>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-2xl italic">Inbox</h2>
            {data.inbox.some((i) => i.kind === "task" && i.sourceId) && (
              <button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await fileEverything();
                    notify(res.ok ? `${res.filed} rangée${(res.filed ?? 0) > 1 ? "s" : ""}.` : res.error, res.ok ? "ok" : "error");
                  })
                }
                className={ghost}
              >
                Tout ranger
              </button>
            )}
          </div>
          <p className="mb-2 text-sm text-ink-soft">Les captures du jour, avec la destination suggérée.</p>
          {data.inbox.length ? (
            <ul>
              {data.inbox.map((i) => (
                <li key={i.id} className="border-b border-rule py-3 last:border-b-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="smallcaps text-xs text-ink-faint">{{ task: "Tâche", idea: "Idée", event: "Événement" }[i.kind]}</span>
                    <span className="min-w-0 flex-1">{i.title}</span>
                    {i.kind !== "idea" && (
                      <input
                        type="date"
                        aria-label="Date"
                        defaultValue={i.dueDate ?? ""}
                        onChange={(e) => start(async () => void (await setInboxDue(i.id, e.target.value || null)))}
                        className={`${field} py-1 text-xs`}
                      />
                    )}
                  </div>
                  {i.kind === "task" && <p className="mt-1 text-xs text-ink-faint">{i.sourceName ? `→ ${i.sourceName}${i.projectName ? ` · ${i.projectName}` : ""}` : "Aucune destination suggérée"}</p>}
                  <InboxActions id={i.id} fileable={i.kind === "task"} suggestedSourceId={i.sourceId} sources={data.sources} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-3 font-serif italic text-ink-faint">Rien capturé aujourd&apos;hui.</p>
          )}
          {data.olderInbox > 0 && <p className="mt-2 text-xs text-ink-faint">{data.olderInbox} capture{data.olderInbox > 1 ? "s" : ""} plus ancienne{data.olderInbox > 1 ? "s" : ""} dans l&apos;Inbox.</p>}
        </section>
      )}

      {step === 3 && (
        <section>
          <h2 className="mb-1 font-serif text-2xl italic">Demain</h2>
          <p className="mb-2 text-sm text-ink-soft">
            {formatDayShort(data.tomorrow)} : trois priorités au plus, et une première action pour démarrer sans réfléchir.
          </p>
          <ul>
            {data.pool.map((t) => {
              const on = top3.includes(t.id);
              return (
                <li key={t.id} className="flex items-start gap-3 border-b border-rule py-2.5 last:border-b-0">
                  <input type="checkbox" id={`top-${t.id}`} checked={on} disabled={!on && top3.length >= 3} onChange={() => toggleTop(t.id)} className="mt-1 size-4 accent-[var(--accent)]" />
                  <label htmlFor={`top-${t.id}`} className="min-w-0 flex-1 text-sm">
                    <span className="block truncate">{t.title}</span>
                    <span className="text-xs text-ink-faint">
                      {PRIORITY_LABEL[t.priority ?? 0] ?? "Aucune"}
                      {t.dueDate && ` · ${formatDayShort(t.dueDate)}`}
                      {t.project && ` · ${t.project}`}
                    </span>
                  </label>
                  {on && (
                    <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-soft">
                      <input type="radio" name="first" checked={first === t.id} onChange={() => setFirstPicked(t.id)} className="accent-[var(--accent)]" />
                      première action
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
          {data.pool.length === 0 && <p className="py-3 font-serif italic text-ink-faint">Aucune tâche ouverte. Demain commence sur une page blanche.</p>}

          {data.habits.length > 0 && (
            <>
              <h3 className="mb-1 mt-8 font-serif text-xl italic">Habitudes du jour</h3>
              <ul>
                {data.habits.map((h) => (
                  <li key={h.id} className="border-b border-rule last:border-b-0">
                    <label className="flex cursor-pointer items-center gap-3 py-2.5 text-sm">
                      <input type="checkbox" checked={habitDone(h.id, h.done)} onChange={(e) => setTicks((t) => ({ ...t, [h.id]: e.target.checked }))} className="size-4 accent-[var(--accent)]" />
                      <span className="flex-1">{h.name}</span>
                      {h.protected && <span className="smallcaps text-xs text-ink-faint">protégée</span>}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {step === 4 && (
        <section>
          <h2 className="mb-1 font-serif text-2xl italic">Rien d&apos;oublié ?</h2>
          <p className="mb-3 text-sm text-ink-soft">Une idée, un truc à faire, un rendez-vous : vide ta tête ici, ça ira dans l&apos;Inbox.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) addCapture();
            }}
            className="flex gap-2"
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="ex. appeler la banque vendredi" aria-label="Ce qui est resté en tête" className={`${field} min-w-0 flex-1`} />
            <button disabled={pending || !text.trim()} className={ghost}>Ajouter</button>
          </form>
          {captured.length > 0 && (
            <ul className="mt-3 text-sm text-ink-soft">
              {captured.map((c, i) => (
                <li key={i} className="py-0.5">✓ {c}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="mt-10 flex items-center justify-between gap-4">
        <button disabled={step === 0 || pending} onClick={() => setStep(step - 1)} className="text-sm text-ink-soft hover:text-ink disabled:invisible">
          ← Retour
        </button>
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep(step + 1)} className={primary}>Suivant →</button>
        ) : (
          <button disabled={pending} onClick={close} className={primary}>{pending ? "Un instant…" : "Terminer la journée"}</button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="smallcaps text-xs text-ink-faint">{label}</dt>
      <dd className="font-mono text-2xl tabular-nums">{value}</dd>
    </div>
  );
}
