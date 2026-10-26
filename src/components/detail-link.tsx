"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/** Links to the current page with `?t=` (task) or `?p=` (project) set, which opens the detail panel. */
export function DetailLink({ param, id, className, children }: { param: "t" | "p"; id: string; className?: string; children: ReactNode }) {
  const pathname = usePathname();
  const params = new URLSearchParams(useSearchParams());
  params.delete("t");
  params.delete("p");
  params.set(param, id);
  return (
    <Link href={`${pathname}?${params}`} scroll={false} className={className}>
      {children}
    </Link>
  );
}

/** Closes the detail panel on Escape. */
export function CloseOnEscape({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog][aria-label='Palette de commandes']")) router.push(href, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [href, router]);
  return null;
}
