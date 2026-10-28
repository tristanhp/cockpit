import Link from "next/link";
import type { ReactNode } from "react";
import { CloseOnEscape } from "./detail-link";

export function Shell({ close, eyebrow, title, task, children }: { close: string; eyebrow?: string; title: string; task?: { id: string; done: boolean }; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40">
      <CloseOnEscape href={close} />
      <Link href={close} scroll={false} aria-label="Fermer" className="fade-in absolute inset-0 bg-scrim backdrop-blur-md" />
      <aside
        role="dialog"
        aria-label={title}
        data-task-panel={task ? "" : undefined}
        data-task-id={task?.id}
        data-done={task?.done ? "1" : "0"}
        className="drawer-in absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-rule bg-paper shadow-2xl"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6">
          <div className="min-w-0">
            {eyebrow && <p className="smallcaps font-mono text-xs text-ink-faint">{eyebrow}</p>}
            <h2 className="font-serif text-2xl leading-snug text-balance">{title}</h2>
          </div>
          <Link href={close} scroll={false} className="shrink-0 rounded-md px-2 py-1 font-mono text-xs text-ink-faint hover:bg-paper-2 hover:text-ink">
            Échap
          </Link>
        </div>
        <div className="px-6 pb-8">{children}</div>
      </aside>
    </div>
  );
}

export function Facts({ children }: { children: ReactNode }) {
  return <dl className="my-4 divide-y divide-rule border-y border-rule text-sm">{children}</dl>;
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 py-2.5">
      <dt className="smallcaps w-32 shrink-0 text-ink-faint">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

export function SourceButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-rule-strong px-3 py-1.5 text-sm hover:border-accent hover:text-accent">
      {children} <span aria-hidden>↗</span>
    </a>
  );
}
