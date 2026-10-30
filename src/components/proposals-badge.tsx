"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { pendingProposals } from "@/app/actions";

/** The number of proposals waiting for the owner, refreshed on each page change; nothing while there are none. */
export function useProposalCount(): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    pendingProposals().then((n) => alive && setCount(n)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);
  return count;
}

export function ProposalsBadge({ className = "" }: { className?: string }) {
  const count = useProposalCount();
  if (!count) return null;
  return <span aria-label={`${count} proposition${count > 1 ? "s" : ""} en attente`} className={`rounded-full bg-accent px-1.5 font-mono text-[11px] leading-4 text-paper ${className}`}>{count}</span>;
}
