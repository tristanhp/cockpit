"use client";

import { useEffect, useState } from "react";

/** Registers the service worker in production builds only: in development it would cache stale code. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
  }, []);
  return null;
}

/** A clear banner while offline: what is on screen is the last copy, read-only. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[70] bg-warn px-4 py-1.5 text-center text-xs font-medium text-paper" style={{ paddingTop: "max(6px, env(safe-area-inset-top))" }}>
      Hors ligne : dernière copie, lecture seule
    </div>
  );
}
