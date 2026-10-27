"use client";

import { useState, useTransition } from "react";
import { dismissInbox, fileEverything, fileInbox } from "@/app/actions";
import { notify } from "./feedback";

const button = "rounded-md border border-rule-strong px-2.5 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50";

export function InboxActions({ id, fileable, suggestedSourceId, sources }: { id: string; fileable: boolean; suggestedSourceId: string | null; sources: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [target, setTarget] = useState(suggestedSourceId ?? sources[0]?.id ?? "");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const res = await fn();
      notify(res.ok ? done : (res.error ?? "Une erreur est survenue"), res.ok ? "ok" : "error");
    });

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {fileable && (
        <>
          <select
            id={`inbox-target-${id}`}
            aria-label="Destination"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="rounded-md border border-rule-strong bg-paper px-1.5 py-1 text-xs"
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button disabled={pending || !target} onClick={() => run(() => fileInbox(id, target, target === suggestedSourceId ? undefined : null), "Rangée.")} className={button}>
            Ranger
          </button>
        </>
      )}
      <button disabled={pending} onClick={() => run(() => dismissInbox(id), "Écartée.")} className="text-xs text-ink-faint hover:text-ink">
        Écarter
      </button>
    </div>
  );
}

export function FileAllButton({ count }: { count: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await fileEverything();
          if (res.ok) notify(`${res.filed} capture${(res.filed ?? 0) > 1 ? "s" : ""} rangée${(res.filed ?? 0) > 1 ? "s" : ""}.`);
          else notify(res.error, "error");
        })
      }
      className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Rangement…" : `Tout ranger (${count})`}
    </button>
  );
}
