import type { MatchResult } from "@/engine/season";

export const RESULT_LABEL: Record<MatchResult, string> = { V: "Victoire", N: "Match nul", D: "Défaite" };
const RESULT_TONE: Record<MatchResult, string> = { V: "border-ok text-ok", N: "border-warn text-warn", D: "border-margin text-margin" };

/** A V, N or D box; a cup match gets a ring. */
export function ResultChip({ result, cup = false }: { result: MatchResult; cup?: boolean }) {
  return (
    <span title={`${RESULT_LABEL[result]}${cup ? " · coupe" : ""}`} className={`inline-flex size-6 items-center justify-center rounded-sm border font-mono text-xs ${RESULT_TONE[result]} ${cup ? "ring-1 ring-ink-faint ring-offset-1 ring-offset-paper" : ""}`}>
      {result}
    </span>
  );
}
