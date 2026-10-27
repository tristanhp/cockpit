"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { setTaskField } from "@/app/actions";
import { notify } from "./feedback";

type B = { id: string; title: string; end: string; taskId: string };

/** In-app reminder while the page is open: at block end + grace, ask whether it is finished. */
export function BlockEndBanner({ blocks, graceMin }: { blocks: B[]; graceMin: number }) {
  const [now, setNow] = useState(() => Date.now());
  const [hidden, setHidden] = useState<string[]>([]);
  const [pending, start] = useTransition();
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const due = blocks.find((b) => !hidden.includes(b.id) && now >= Date.parse(b.end) + graceMin * 60_000);
  if (!due) return null;
  return (
    <div role="status" className="fade-in mt-3 flex flex-wrap items-center gap-3 border-l-2 border-warn pl-4 text-sm">
      <span className="min-w-0 flex-1">« {due.title} » est terminé. Tâche finie ?</span>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setTaskField(due.taskId, "done", true);
            notify(res.ok ? "Tâche terminée." : res.error, res.ok ? "ok" : "error");
          })
        }
        className="rounded-md border border-rule-strong px-2.5 py-1 text-xs hover:border-ok hover:text-ok"
      >
        Oui, c&apos;est fait
      </button>
      <Link href={`/?r=${encodeURIComponent(due.id)}`} scroll={false} className="rounded-md border border-rule-strong px-2.5 py-1 text-xs hover:border-accent hover:text-accent">
        Replacer
      </Link>
      <button onClick={() => setHidden((h) => [...h, due.id])} className="text-xs text-ink-faint hover:text-ink">Plus tard</button>
    </div>
  );
}
