import { Suspense } from "react";
import { connection } from "next/server";
import { formatDayMonth } from "@/lib/dates";
import { reviewView } from "@/review";
import { seasonReveal } from "@/season";
import { PageHeader } from "@/components/ui";
import { RevueFlow } from "@/components/revue-flow";

export default function RevuePage() {
  return (
    <Suspense fallback={<p className="font-serif italic text-ink-faint">Ouverture du carnet…</p>}>
      <Revue />
    </Suspense>
  );
}

async function Revue() {
  await connection();
  const view = await reviewView();
  const season = await seasonReveal(view.weekStart);
  return (
    <>
      <PageHeader eyebrow={`semaine ${view.weekNumber}`} title="La revue" subtitle={`Du ${formatDayMonth(view.weekStart)} — dix minutes, puis la semaine à venir`} />
      <RevueFlow key={`${view.review.id}:${view.review.status}`} view={view} season={season} />
    </>
  );
}
