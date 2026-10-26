"use client";

import { useState, useTransition } from "react";
import { syncNow } from "@/app/actions";
import type { SyncReport } from "@/sync";

export function SyncButton({ lastSyncLabel }: { lastSyncLabel: string }) {
  const [pending, start] = useTransition();
  const [report, setReport] = useState<SyncReport | null>(null);
  const failed = report?.filter((r) => !r.ok) ?? [];

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => start(async () => setReport(await syncNow()))}
        disabled={pending}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-60"
      >
        {pending ? "Synchronisation…" : "Synchroniser"}
      </button>
      <span className="text-xs text-faint">
        {report
          ? failed.length
            ? `${failed.length} source(s) en erreur, voir Réglages`
            : `${report.length} sources à jour`
          : `Dernière synchro : ${lastSyncLabel}`}
      </span>
    </div>
  );
}
