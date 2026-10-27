"use client";

import { useTransition } from "react";
import { undoChangeAction } from "@/app/actions";
import { notify } from "./feedback";

export function UndoButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await undoChangeAction(id);
          notify(res.ok ? "Changement annulé." : res.error, res.ok ? "ok" : "error");
        })
      }
      className="rounded-md border border-rule-strong px-2 py-0.5 text-xs hover:border-accent hover:text-accent disabled:opacity-50"
    >
      Annuler
    </button>
  );
}
