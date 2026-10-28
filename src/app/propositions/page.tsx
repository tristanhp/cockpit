import { Suspense } from "react";
import { connection } from "next/server";
import { formatRelative } from "@/lib/dates";
import { listProposals } from "@/proposals";
import { EXPIRY_DAYS } from "@/proposals/schema";
import { Empty, PageHeader, Section } from "@/components/ui";
import { ProposalActions } from "@/components/proposal-card";

export default function ProposalsPage() {
  return (
    <Suspense fallback={<p className="font-serif italic text-ink-faint">Ouverture du carnet…</p>}>
      <Proposals />
    </Suspense>
  );
}

const KIND: Record<string, string> = { capture: "Capture", reschedule: "Déplacement", task_update: "Modification", goal_breakdown: "Découpage" };
const STATUS: Record<string, string> = { accepted: "acceptée", rejected: "refusée", expired: "expirée" };

async function Proposals() {
  await connection();
  const all = await listProposals({ limit: 100 });
  const pending = all.filter((p) => p.status === "pending");
  const decided = all.filter((p) => p.status !== "pending").slice(0, 20);
  return (
    <>
      <PageHeader eyebrow="ce que Claude te propose" title="Propositions" subtitle={`${pending.length} en attente · rien ne change tant que tu n'as pas accepté`} />

      <Section title="En attente" count={pending.length} aside={`expirent après ${EXPIRY_DAYS} jours`}>
        {pending.length ? (
          <ul>
            {pending.map((p) => (
              <li key={p.id} className="border-b border-rule py-4 last:border-b-0">
                <p className="smallcaps text-xs text-ink-faint">{KIND[p.kind] ?? p.kind} · {formatRelative(p.createdAt)}</p>
                <p className="font-serif text-xl italic leading-snug">{p.summary.title}</p>
                {p.summary.lines.length > 0 && <ul className="mt-1 text-sm text-ink-soft">{p.summary.lines.map((l) => <li key={l} className="py-0.5">· {l}</li>)}</ul>}
                <p className="mt-2 border-l-2 border-rule-strong pl-3 text-sm text-ink-soft">« {p.rationale} » <span className="text-xs text-ink-faint">— Claude</span></p>
                <ProposalActions id={p.id} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Aucune proposition en attente. Demande à Claude (voir docs/MCP.md) de t&apos;en faire.</Empty>
        )}
      </Section>

      {decided.length > 0 && (
        <Section title="Déjà décidées" count={decided.length}>
          <ul>
            {decided.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 border-b border-rule py-2 text-sm last:border-b-0">
                <span className="min-w-0 flex-1 text-ink-soft">{p.summary.title}</span>
                <span className={`text-xs ${p.status === "accepted" ? "text-ok" : "text-ink-faint"}`}>{STATUS[p.status]}{p.status === "accepted" && p.result ? ` · ${p.result}` : ""}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
