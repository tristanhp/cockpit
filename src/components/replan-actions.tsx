"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { replanBlock, replanMyDay } from "@/app/actions";
import { notify } from "./feedback";

type Option = { key: "auto" | "tonight" | "tomorrow" | "split" | "drop"; label: string; note: string | null; slots: string[] };

export function ReplanChooser({ blockId, options }: { blockId: string; options: Option[] }) {
  const router = useRouter();
  const [choice, setChoice] = useState<Option["key"]>("auto");
  const [pending, start] = useTransition();
  const current = options.find((o) => o.key === choice);
  const usable = choice === "drop" || (current?.slots.length ?? 0) > 0;
  return (
    <div>
      <div role="radiogroup" aria-label="Options" className="grid gap-2">
        {options.map((o) => {
          const disabled = o.key !== "drop" && o.slots.length === 0;
          return (
            <button
              key={o.key}
              role="radio"
              aria-checked={choice === o.key}
              disabled={disabled}
              onClick={() => setChoice(o.key)}
              className={`rounded-md border px-3 py-2 text-left text-sm disabled:opacity-40 ${choice === o.key ? "border-accent bg-accent/10" : "border-rule-strong hover:border-accent"}`}
            >
              <span className="block">{o.label}</span>
              {o.slots.map((s) => (
                <span key={s} className="block font-mono text-xs text-ink-soft">{s}</span>
              ))}
              {disabled ? <span className="block text-xs text-ink-faint">aucun créneau libre</span> : o.note && <span className="block text-xs text-ink-faint">{o.note}</span>}
            </button>
          );
        })}
      </div>
      <button
        disabled={pending || !usable}
        onClick={() =>
          start(async () => {
            const res = await replanBlock(blockId, choice);
            if (!res.ok) return notify(res.error, "error");
            notify(choice === "drop" ? "Bloc abandonné." : "Bloc replacé.");
            router.push("/", { scroll: false });
          })
        }
        className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Un instant…" : "Confirmer"}
      </button>
    </div>
  );
}

export function ApplyDayReplan({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          const res = await replanMyDay();
          if (!res.ok) return notify(res.error, "error");
          notify("Journée replanifiée.");
          router.push("/", { scroll: false });
        })
      }
      className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Un instant…" : "Appliquer"}
    </button>
  );
}
