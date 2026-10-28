"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { completeReviewAction, confirmWeekAction, generateProposalAction, saveReviewStepAction, setGoalStatusAction } from "@/app/actions";
import type { ReviewData } from "@/db/schema";
import { formatDayLong, formatDuration, formatTime, parisDay } from "@/lib/dates";
import type { ReviewView } from "@/review";
import { notify } from "./feedback";
import { ProposalBlockActions } from "./proposal-actions";

const STEPS = ["Une page", "Tes chiffres", "Les fils", "Le focus", "La semaine"] as const;
const primary = "rounded-md bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50";
const ghost = "rounded-md border border-rule-strong px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-50";
const field = "rounded-md border border-rule-strong bg-paper px-3 py-2 text-sm placeholder:text-ink-faint focus:border-accent focus:outline-none";
const label = "flex flex-col gap-1 text-xs text-ink-soft";

type Numbers = NonNullable<ReviewData["numbers"]>;

export function RevueFlow({ view }: { view: ReviewView }) {
  const { review } = view;
  const data = review.data;
  const done = review.status === "done";
  const [step, setStep] = useState(Math.min(data.step ?? 0, STEPS.length - 1));
  const [pending, start] = useTransition();
  const [held, setHeld] = useState<Record<string, boolean>>(data.focusHeld ?? {});
  const [resume, setResume] = useState(data.resume ?? "");
  const [numbers, setNumbers] = useState<Numbers>(data.numbers ?? { sleepAvg: "", bedtimesOnTarget: null, energy: null, win: "" });
  const [threads, setThreads] = useState<Record<string, "plan" | "pause">>(data.threads ?? {});
  const [focus, setFocus] = useState(view.focus);
  const [result, setResult] = useState<{ notion: string; markdown: string } | null>(null);

  const save = (patch: Partial<ReviewData>, then?: () => void) =>
    start(async () => {
      const res = await saveReviewStepAction(view.weekStart, patch);
      if (!res.ok) return notify(res.error, "error");
      then?.();
    });
  const patchFor = (s: number): Partial<ReviewData> =>
    s === 0 ? { focusHeld: held, resume } : s === 1 ? { numbers } : s === 2 ? { threads } : s === 3 ? { focus } : {};
  const go = (to: number) => save({ ...patchFor(step), step: to }, () => setStep(to));

  if (done)
    return (
      <div className="max-w-2xl">
        <p className="font-serif text-2xl italic">Revue terminée.</p>
        <p className="mt-2 text-sm text-ink-soft">Elle est enregistrée dans Cockpit{review.completedAt ? ` (${formatDayLong(parisDay(review.completedAt))})` : ""}.</p>
        {result && (
          <ul className="mt-3 text-sm text-ink-soft">
            <li>Notion : {result.notion}</li>
            <li>Markdown : {result.markdown}</li>
          </ul>
        )}
        <Link href="/semaine?sem=prochaine" className={`${ghost} mt-6 inline-block`}>Voir la semaine</Link>
      </div>
    );

  const m = view.metrics;
  const proposal = view.proposal;
  const confirmed = Boolean(data.confirmedAt);

  return (
    <div className="max-w-2xl">
      <ol className="mb-8 grid grid-cols-5 gap-2" aria-label="Progression">
        {STEPS.map((l, i) => (
          <li key={l} aria-current={i === step ? "step" : undefined}>
            <button onClick={() => go(i)} disabled={pending} className="block w-full text-left">
              <div className={`h-1 rounded-full ${i <= step ? "bg-accent" : "bg-rule-strong"}`} />
              <p className={`mt-1.5 truncate text-xs ${i === step ? "text-ink" : "text-ink-faint"}`}><span className="font-mono">{i + 1}</span> {l}</p>
            </button>
          </li>
        ))}
      </ol>
      {(data.step ?? 0) > 0 && step === (data.step ?? 0) && <p className="mb-4 text-xs text-ink-faint">Brouillon repris là où tu t&apos;étais arrêté.</p>}

      {step === 0 && (
        <section>
          <h2 className="mb-3 font-serif text-2xl italic">Une page</h2>
          <dl className="grid grid-cols-2 gap-4 border-y border-rule py-4 sm:grid-cols-4">
            <Stat label="Sport" value={`${m.sportDone} / ${m.sportPlanned}`} />
            <Stat label="Blocs tenus" value={`${m.blocksKept} / ${m.blocksPlanned}`} />
            <Stat label="Points faits" value={`${m.pointsDone} / ${m.pointsPlanned}`} />
            <Stat label="Clôtures" value={`${m.ritualsDone} / 7`} />
          </dl>
          {view.lastFocus.length > 0 && (
            <div className="mt-5">
              <p className="smallcaps mb-1 text-xs text-ink-faint">Le focus de la semaine dernière</p>
              <ul>
                {view.lastFocus.map((f) => (
                  <li key={f.projectId} className="flex items-center gap-3 border-b border-rule py-2 text-sm last:border-b-0">
                    <input type="checkbox" id={`held-${f.projectId}`} checked={held[f.projectId] ?? false} onChange={(e) => setHeld((h) => ({ ...h, [f.projectId]: e.target.checked }))} className="size-4 accent-[var(--accent)]" />
                    <label htmlFor={`held-${f.projectId}`} className="min-w-0 flex-1"><span className="block truncate">{f.name}</span><span className="text-xs text-ink-faint">{f.result || "—"}</span></label>
                    <span className="text-xs text-ink-faint">tenu ?</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {view.alerts.length > 0 && (
            <div className="mt-6 border-l-2 border-margin pl-4">
              <ul className="text-sm text-ink-soft">{view.alerts.map((a) => <li key={a.kind} className="py-0.5">{a.message}</li>)}</ul>
              <label className={`${label} mt-3`}>
                {view.resumeQuestion}
                <textarea value={resume} onChange={(e) => setResume(e.target.value)} rows={2} className={field} />
              </label>
            </div>
          )}
        </section>
      )}

      {step === 1 && (
        <section>
          <h2 className="mb-3 font-serif text-2xl italic">Tes chiffres</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>Sommeil moyen<input value={numbers.sleepAvg} onChange={(e) => setNumbers({ ...numbers, sleepAvg: e.target.value })} placeholder="7 h 15" className={field} /></label>
            <label className={label}>
              Couchers à l&apos;heure (sur 7)
              <input type="number" min={0} max={7} value={numbers.bedtimesOnTarget ?? ""} onChange={(e) => setNumbers({ ...numbers, bedtimesOnTarget: e.target.value === "" ? null : Math.max(0, Math.min(7, Number(e.target.value))) })} className={field} />
            </label>
            <label className={label}>
              Énergie (sur 5)
              <select value={numbers.energy ?? ""} onChange={(e) => setNumbers({ ...numbers, energy: e.target.value === "" ? null : Number(e.target.value) })} className={field}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className={`${label} sm:col-span-2`}>Une victoire de la semaine<input value={numbers.win} onChange={(e) => setNumbers({ ...numbers, win: e.target.value })} className={field} /></label>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h2 className="mb-1 font-serif text-2xl italic">Les fils</h2>
          <p className="mb-2 text-sm text-ink-soft">Chaque objectif actif, avec où il en est.</p>
          {view.goals.length ? (
            <ul>
              {view.goals.map((g) => (
                <li key={g.id} className="border-b border-rule py-3 last:border-b-0">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate">{g.title}</span>
                    {g.signals.map((s) => <span key={s} className="smallcaps text-xs text-ink-faint">{s}</span>)}
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-rule"><span className="block h-full bg-accent" style={{ width: `${g.pct}%` }} /></span>
                    <span className="w-32 shrink-0 text-right font-mono text-xs text-ink-soft">{g.progress}</span>
                  </div>
                  {g.drifting && (
                    <div className="mt-2 text-sm text-ink-soft">
                      Rien n&apos;est prévu pour cet objectif : tu planifies quelque chose, ou tu le mets en pause ?
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        <button onClick={() => setThreads((t) => ({ ...t, [g.id]: "plan" }))} aria-pressed={threads[g.id] === "plan"} className={`${ghost} ${threads[g.id] === "plan" ? "border-accent text-accent" : ""}`}>On planifie quelque chose</button>
                        <button
                          disabled={pending}
                          onClick={() => start(async () => { const r = await setGoalStatusAction(g.id, "paused"); if (!r.ok) return notify(r.error, "error"); setThreads((t) => ({ ...t, [g.id]: "pause" })); notify("Objectif mis en pause."); })}
                          className={`${ghost} ${threads[g.id] === "pause" ? "border-accent text-accent" : ""}`}
                        >
                          Mettre en pause
                        </button>
                      </div>
                      {threads[g.id] === "plan" && <p className="mt-1 text-xs text-ink-faint">Un bloc sera réservé pour lui dans la semaine proposée.</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-3 font-serif italic text-ink-faint">Aucun objectif actif.</p>
          )}
        </section>
      )}

      {step === 3 && (
        <section>
          <h2 className="mb-1 font-serif text-2xl italic">Le focus</h2>
          <p className="mb-3 text-sm text-ink-soft">Un résultat attendu par projet prioritaire, pour la semaine qui vient. Prérempli avec la prochaine action.</p>
          {focus.length ? (
            <ul className="grid gap-3">
              {focus.map((f, i) => (
                <li key={f.projectId}>
                  <label className={label}>{f.name}<input value={f.result} onChange={(e) => setFocus((all) => all.map((x, k) => (k === i ? { ...x, result: e.target.value } : x)))} className={field} /></label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-3 font-serif italic text-ink-faint">Aucun projet de priorité Urgent ou Haute.</p>
          )}
        </section>
      )}

      {step === 4 && (
        <section>
          <h2 className="mb-1 font-serif text-2xl italic">La semaine</h2>
          <p className="mb-3 text-sm text-ink-soft">
            Budget : <span className="font-mono">{view.budget.budget} points</span> (vitesse {view.budget.velocity}, minimum {view.budget.min}).
          </p>
          {view.thisWeekLoad.message && <p className="mb-3 border-l-2 border-warn pl-4 text-sm text-ink-soft">Cette semaine : {view.thisWeekLoad.message}</p>}
          {!proposal ? (
            <button disabled={pending} onClick={() => start(async () => { const r = await generateProposalAction(); if (!r.ok) notify(r.error, "error"); })} className={primary}>
              {pending ? "Un instant…" : "Proposer la semaine"}
            </button>
          ) : (
            <Proposal view={view} confirmed={confirmed} />
          )}
        </section>
      )}

      <div className="mt-10 flex items-center justify-between gap-4">
        <button disabled={step === 0 || pending} onClick={() => go(step - 1)} className="text-sm text-ink-soft hover:text-ink disabled:invisible">← Retour</button>
        {step < STEPS.length - 1 ? (
          <button disabled={pending} onClick={() => go(step + 1)} className={primary}>Suivant →</button>
        ) : (
          <button
            disabled={pending || !proposal}
            onClick={() =>
              start(async () => {
                const saved = await saveReviewStepAction(view.weekStart, patchFor(step));
                if (!saved.ok) return notify(saved.error, "error");
                const res = await completeReviewAction(view.weekStart);
                if (!res.ok) return notify(res.error, "error");
                setResult(res.result ?? null);
              })
            }
            className={primary}
          >
            Terminer la revue
          </button>
        )}
      </div>
    </div>
  );
}

function Proposal({ view, confirmed }: { view: ReviewView; confirmed: boolean }) {
  const proposal = view.proposal!;
  const [pending, start] = useTransition();
  const kept = proposal.blocks.filter((b) => !b.excluded);
  const points = kept.reduce((n, b) => n + b.points, 0) + proposal.alreadyPlanned;
  const days = [...new Set(proposal.blocks.map((b) => parisDay(new Date(b.start))))];
  const iso = (ms: number) => new Date(ms).toISOString();
  return (
    <div>
      <p className="mb-2 text-sm text-ink-soft">
        {kept.length} bloc{kept.length > 1 ? "s" : ""}, <span className="font-mono">{points} / {proposal.budget}</span> points.
        {points > proposal.budget && <span className="text-warn"> Tu dépasses le budget.</span>}
      </p>
      {days.map((day) => (
        <div key={day} className="mb-4">
          <p className="smallcaps border-b border-rule pb-1 text-xs text-ink-faint">{formatDayLong(day)}</p>
          <ul>
            {proposal.blocks.filter((b) => parisDay(new Date(b.start)) === day).map((b) => (
              <li key={b.key} className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule py-2 text-sm last:border-b-0 ${b.excluded ? "opacity-50" : ""}`}>
                <span className="w-24 shrink-0 font-mono text-xs tabular-nums text-ink-faint">{formatTime(iso(b.start))}–{formatTime(iso(b.end))}</span>
                <span className={`min-w-0 flex-1 ${b.excluded ? "line-through" : ""}`}>
                  {b.title}
                  <span className="block text-xs text-ink-faint">{formatDuration(Math.round((b.end - b.start) / 60000))}{b.points ? ` · ${b.points} pt${b.points > 1 ? "s" : ""}` : ""} · {b.reason}</span>
                </span>
                <ProposalBlockActions weekStart={view.weekStart} blockKey={b.key} excluded={Boolean(b.excluded)} locked={confirmed} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {proposal.blocks.length === 0 && <p className="py-2 font-serif italic text-ink-faint">Rien à placer dans cette semaine.</p>}
      {proposal.unplaced.length > 0 && (
        <div className="mt-4">
          <p className="smallcaps text-xs text-ink-faint">Ce qui n&apos;a pas de place</p>
          <ul className="text-sm text-ink-soft">{proposal.unplaced.map((u) => <li key={u.id} className="py-0.5">{u.title} <span className="text-xs text-ink-faint">· {u.reason}</span></li>)}</ul>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {confirmed ? (
          <p className="text-sm text-ok">Semaine confirmée : les blocs sont dans l&apos;agenda.</p>
        ) : (
          <>
            <button
              disabled={pending || kept.length === 0}
              onClick={() => start(async () => { const r = await confirmWeekAction(view.weekStart); notify(r.ok ? `${r.created} bloc${(r.created ?? 0) > 1 ? "s" : ""} ajouté${(r.created ?? 0) > 1 ? "s" : ""} à l'agenda.` : r.error, r.ok ? "ok" : "error"); })}
              className={primary}
            >
              Confirmer la semaine
            </button>
            <button disabled={pending} onClick={() => start(async () => { const r = await generateProposalAction(); notify(r.ok ? "Proposition recalculée." : r.error, r.ok ? "ok" : "error"); })} className={ghost}>Recalculer</button>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label: l, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="smallcaps text-xs text-ink-faint">{l}</dt>
      <dd className="font-mono text-2xl tabular-nums">{value}</dd>
    </div>
  );
}
