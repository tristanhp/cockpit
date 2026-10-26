"use client";

import { useEffect, useState } from "react";

const EVENT = "cockpit:toast";
type Toast = { id: number; message: string; tone: "ok" | "error" };

/** Shows a short message at the bottom of the page, from anywhere on the client. */
export function notify(message: string, tone: Toast["tone"] = "ok") {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, tone } }));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    const onToast = (e: Event) => {
      const { message, tone } = (e as CustomEvent<Pick<Toast, "message" | "tone">>).detail;
      const id = ++n;
      setToasts((t) => [...t, { id, message, tone }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3000);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);
  if (!toasts.length) return null;
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={`fade-in pointer-events-auto max-w-md rounded-md border bg-paper px-4 py-2.5 text-sm shadow-xl ${t.tone === "error" ? "border-margin text-margin" : "border-rule-strong text-ink"}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
