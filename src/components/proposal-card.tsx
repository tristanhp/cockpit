"use client";

import { useTransition } from "react";
import { acceptProposalAction, rejectProposalAction } from "@/app/actions";
import { notify } from "./feedback";

const primary = "rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50";
const ghost = "rounded-md border border-rule-strong px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-50";

/** Accepter runs the change through the app's own write paths; Refuser changes nothing but the proposal. */
export function ProposalActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-3 flex gap-2">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await acceptProposalAction(id);
            notify(res.ok ? (res.message ?? "Proposition acceptée.") : res.error, res.ok ? "ok" : "error");
          })
        }
        className={primary}
      >
        Accepter
      </button>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await rejectProposalAction(id);
            notify(res.ok ? "Proposition refusée." : res.error, res.ok ? "ok" : "error");
          })
        }
        className={ghost}
      >
        Refuser
      </button>
    </div>
  );
}
