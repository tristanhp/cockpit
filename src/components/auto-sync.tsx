"use client";

import { useEffect } from "react";
import { syncNow } from "@/app/actions";

const EVERY = 5 * 60_000;
const KEY = "cockpit:sync-lock";

/** Syncs every 5 minutes while a page is open and when the window regains focus; a lock keeps two tabs apart. */
export function AutoSync() {
  useEffect(() => {
    const due = () => {
      try {
        return Date.now() - Number(localStorage.getItem(KEY) ?? 0) >= EVERY;
      } catch {
        return true;
      }
    };
    const run = () => {
      if (document.visibilityState !== "visible" || !due()) return;
      try {
        localStorage.setItem(KEY, String(Date.now()));
      } catch {}
      void syncNow();
    };
    const timer = setInterval(run, 60_000);
    window.addEventListener("focus", run);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", run);
    };
  }, []);
  return null;
}
