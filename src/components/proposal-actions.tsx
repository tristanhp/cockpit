"use client";

import { useTransition } from "react";
import { excludeBlockAction, moveBlockAction } from "@/app/actions";
import { notify } from "./feedback";

const chip = "rounded-md border border-rule-strong px-2 py-0.5 text-xs hover:border-accent hover:text-accent disabled:opacity-50";

/** Buttons on a proposed block: keep it or take it out, and move it to another free slot. */
export function ProposalBlockActions({ weekStart, blockKey, excluded, locked }: { weekStart: string; blockKey: string; excluded: boolean; locked: boolean }) {
  const [pending, start] = useTransition();
  if (locked) return null;
  return (
    <span className="flex shrink-0 gap-1.5">
      <button
        disabled={pending}
        onClick={() => start(async () => { const r = await excludeBlockAction(weekStart, blockKey, !excluded); if (!r.ok) notify(r.error, "error"); })}
        className={chip}
      >
        {excluded ? "Remettre" : "Retirer"}
      </button>
      <button
        disabled={pending || excluded}
        onClick={() => start(async () => { const r = await moveBlockAction(weekStart, blockKey); notify(r.ok ? "Bloc déplacé." : r.error, r.ok ? "ok" : "error"); })}
        className={chip}
      >
        Autre créneau
      </button>
    </span>
  );
}
