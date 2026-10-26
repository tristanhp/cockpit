"use client";

import { useState, useTransition } from "react";
import { syncNow } from "@/app/actions";
import type { SyncReport } from "@/sync";

export function SyncButton({ lastSyncLabel }: { lastSyncLabel: string }) {
  const [pending, start] = useTransition();
  const [report, setReport] = useState<SyncReport | null>(null);
  const failed = report?.filter((r) => !r.ok) ?? [];

  return (
    <div className="flex items-center gap-3 md:flex-col md:items-end md:gap-1">
      <button
        onClick={() => start(async () => setReport(await syncNow()))}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md border border-rule-strong px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className={`size-4 ${pending ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" />
        </svg>
        {pending ? "Synchronisation…" : "Synchroniser"}
      </button>
      <span className={`text-xs ${failed.length ? "text-margin" : "text-ink-faint"}`}>
        {report
          ? failed.length
            ? `${failed.length} source(s) en erreur, voir Réglages`
            : `${report.length} sources à jour`
          : `synchro ${lastSyncLabel}`}
      </span>
    </div>
  );
}
