import { Suspense } from "react";
import { connection } from "next/server";
import { formatDayMonth, weekdayName } from "@/lib/dates";
import { clotureData } from "@/rituals";
import { PageHeader } from "@/components/ui";
import { ClotureFlow } from "@/components/cloture-flow";

export default function CloturePage() {
  return (
    <Suspense fallback={<p className="font-serif italic text-ink-faint">Ouverture du carnet…</p>}>
      <Cloture />
    </Suspense>
  );
}

async function Cloture() {
  await connection();
  const data = await clotureData();
  return (
    <>
      <PageHeader eyebrow={weekdayName(data.day)} title="La clôture" subtitle={`${formatDayMonth(data.day)} — trois minutes, puis les écrans s'éteignent`} />
      <ClotureFlow data={data} />
    </>
  );
}
