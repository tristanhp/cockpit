"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { setTaskField } from "@/app/actions";
import { EFFORTS, PRIORITY_LABEL } from "@/engine/priority";
import { openCapture } from "./capture-dialog";
import { notify } from "./feedback";

/** The task under focus: a focused row, else the task open in the detail panel. */
function focusedTask(): { id: string; row: HTMLElement | null; done: boolean } | null {
  const row = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-task-id]") ?? null;
  if (row?.dataset.taskId) return { id: row.dataset.taskId, row, done: row.dataset.done === "1" };
  const panel = document.querySelector<HTMLElement>("[data-task-panel]");
  return panel?.dataset.taskId ? { id: panel.dataset.taskId, row: null, done: panel.dataset.done === "1" } : null;
}

/**
 * Keyboard essentials: `c` capture, `x` done, `p` then 0-4 priority, `e` then 1/2/3/5/8 effort.
 * Everything optimistic: the row dims, then the server refreshes; a failure restores it.
 */
export function KeyboardLayer() {
  const router = useRouter();
  useEffect(() => {
    let chord: "p" | "e" | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const write = async (task: { id: string; row: HTMLElement | null }, field: "done" | "priority" | "effort", value: boolean | number, message: string) => {
      task.row?.classList.add("opacity-40");
      const res = await setTaskField(task.id, field, value);
      if (!res.ok) {
        task.row?.classList.remove("opacity-40");
        return notify(res.error, "error");
      }
      notify(message);
    };

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || target.closest("input, textarea, select, [contenteditable], [role=dialog][aria-label='Palette de commandes'], [role=dialog][aria-label='Capture rapide']")) return;
      const key = e.key.toLowerCase();
      // Digits by physical key: on AZERTY the unshifted digit row types & é " ' ( instead of 1 2 3 4 5.
      const digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code)?.[1] ?? (/^\d$/.test(key) ? key : null);

      if (chord) {
        const mode = chord;
        chord = null;
        clearTimeout(timer);
        const task = focusedTask();
        if (!task) return;
        if (digit === null) return;
        if (mode === "p" && /^[0-4]$/.test(digit)) {
          e.preventDefault();
          void write(task, "priority", Number(digit), `Priorité : ${PRIORITY_LABEL[Number(digit)]}`);
        } else if (mode === "e" && (EFFORTS as readonly number[]).includes(Number(digit))) {
          e.preventDefault();
          void write(task, "effort", Number(digit), `Effort : ${digit} pt${Number(digit) > 1 ? "s" : ""}`);
        }
        return;
      }

      if (key === "r") {
        e.preventDefault();
        router.push("/?replan=1");
      } else if (key === "c") {
        e.preventDefault();
        openCapture();
      } else if (key === "x") {
        const task = focusedTask();
        if (!task) return;
        e.preventDefault();
        void write(task, "done", !task.done, task.done ? "Tâche rouverte." : "Tâche terminée. Annulable dans Réglages.");
      } else if ((key === "p" || key === "e") && focusedTask()) {
        chord = key;
        timer = setTimeout(() => (chord = null), 1500);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
