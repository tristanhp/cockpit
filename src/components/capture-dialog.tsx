"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { capture } from "@/app/actions";
import { parseCapture } from "@/engine/capture";
import { formatDayShort } from "@/lib/dates";
import { notify } from "./feedback";

const OPEN_EVENT = "cockpit:capture";
export const openCapture = () => window.dispatchEvent(new Event(OPEN_EVENT));

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());

/** One line, three seconds: the text goes to the right source or waits in the Inbox. */
export function CaptureDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const show = () => {
      setText("");
      setError(null);
      setOpen(true);
      requestAnimationFrame(() => input.current?.focus());
    };
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  if (!open) return null;
  const parsed = text.trim() ? parseCapture(text, today()) : null;
  const KIND = { task: "Tâche", idea: "Idée", event: "Événement" } as const;

  const submit = () =>
    start(async () => {
      const res = await capture(text);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      notify(res.message);
    });

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-start justify-center bg-scrim px-4 pt-[14vh] backdrop-blur-md" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-label="Capture rapide"
        className="w-full max-w-xl overflow-hidden rounded-lg border border-rule-strong bg-paper shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={input}
          id="capture-text"
          value={text}
          disabled={pending}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "Enter" && text.trim()) submit();
            else return;
            e.preventDefault();
          }}
          placeholder="Capturer : « Rendre le TP vendredi 18h #memoire »"
          className="w-full bg-transparent px-4 py-3.5 font-serif text-lg outline-none placeholder:text-ink-faint"
        />
        <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule px-4 py-2 text-xs text-ink-faint">
          {error ? (
            <span className="text-margin">{error}</span>
          ) : parsed ? (
            <>
              <span className="smallcaps">{KIND[parsed.kind]}</span>
              {parsed.due && (
                <span>
                  {formatDayShort(parsed.due)}
                  {parsed.time && ` · ${parsed.time}`}
                </span>
              )}
              {parsed.tags.map((t) => (
                <span key={t} className="font-mono">#{t}</span>
              ))}
            </>
          ) : (
            <span>↵ capturer · Échap fermer · jour, heure, #projet et « idée : » sont compris</span>
          )}
        </div>
      </div>
    </div>
  );
}
