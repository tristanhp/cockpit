"use client";

import { useTransition } from "react";
import { exportGoalsAction } from "@/app/actions";
import { notify } from "./feedback";

export function ExportGoals({ configured }: { configured: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-3">
      <p className="mb-2 text-xs text-ink-faint">
        {configured ? "Le fichier de vision et un fichier par saison sont écrits après chaque modification." : "Renseigne VAULT_GOALS_PATH (voir docs/DEPLOY.md) pour exporter la vision et les objectifs en Markdown."}
      </p>
      <button
        disabled={pending || !configured}
        onClick={() =>
          start(async () => {
            const res = await exportGoalsAction();
            notify(res.ok ? (res.message ?? "Exporté.") : res.error, res.ok ? "ok" : "error");
          })
        }
        className="rounded-md border border-rule-strong px-2.5 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50"
      >
        Exporter maintenant
      </button>
    </div>
  );
}
