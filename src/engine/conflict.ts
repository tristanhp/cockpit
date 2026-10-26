// "Latest edit wins". A Cockpit-only override (a priority or effort the source has
// no property for) is kept across syncs, unless the source row was edited after it.

export type OverrideDecision = "keep-override" | "source-wins";

export function resolveOverride(overrideAt: string, remoteUpdatedAt: string | null): OverrideDecision {
  if (!remoteUpdatedAt) return "keep-override";
  return Date.parse(remoteUpdatedAt) > Date.parse(overrideAt) ? "source-wins" : "keep-override";
}
