import { Suspense } from "react";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Source } from "@/db/schema";
import { formatRelative } from "@/lib/dates";
import { connectors, isDemo } from "@/sync";
import { addNotionSource, adoptDiscovery, discoverNow, dismissDiscovery, toggleSource } from "@/app/actions";
import { Card, Empty, PageHeader, Section } from "@/components/ui";

const KIND_TITLE: Record<Source["kind"], string> = { notion: "Notion", linear: "Linear", gcal: "Google Agenda" };
const ROLE_LABEL: Record<Source["role"], string> = { tasks: "tâches", projects: "projets", milestones: "jalons", reviews: "revues", events: "événements" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-faint">Chargement…</p>}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  await connection();
  const [sources, discoveries, projects] = await Promise.all([
    db.select().from(schema.sources),
    db.select().from(schema.discoveries).where(eq(schema.discoveries.dismissed, false)),
    db.select({ name: schema.projects.name }).from(schema.projects),
  ]);
  const demo = isDemo();
  const setup = Object.fromEntries(
    await Promise.all(Object.values(connectors).map(async (c) => [c.kind, demo ? null : await c.missingSetup()] as const)),
  ) as Record<Source["kind"], string | null>;

  const input = "rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm";

  return (
    <>
      <PageHeader title="Réglages" subtitle="Sources connectées. Ajouter une base, un agenda ou une équipe ne demande aucun code." />

      <Section title="Connexions">
        <Card>
          <ul className="divide-y divide-border">
            {(Object.keys(KIND_TITLE) as Source["kind"][]).map((kind) => (
              <li key={kind} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className={`size-2 rounded-full ${setup[kind] ? "bg-warn" : "bg-ok"}`} />
                <span className="w-32">{KIND_TITLE[kind]}</span>
                <span className="flex-1 text-xs text-muted">{demo ? "Mode démo : données fictives" : (setup[kind] ?? "Connecté")}</span>
                {kind === "gcal" && !demo && process.env.GOOGLE_CLIENT_ID && (
                  <a href="/api/google/auth" className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-2">
                    {setup.gcal ? "Connecter Google" : "Reconnecter"}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      <Section
        title="Nouvelles sources détectées"
        count={discoveries.length}
        aside={
          <form action={async () => { "use server"; await discoverNow(); }}>
            <button className="text-xs text-accent hover:underline">Détecter maintenant</button>
          </form>
        }
      >
        {discoveries.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {discoveries.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-20 text-xs text-faint">{KIND_TITLE[d.kind]}</span>
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  <form action={adoptDiscovery} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={d.id} />
                    {d.kind === "notion" && (
                      <select name="role" className={input} defaultValue="tasks">
                        <option value="tasks">Tâches</option>
                        <option value="projects">Projets</option>
                        <option value="milestones">Jalons</option>
                      </select>
                    )}
                    <button className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-2">Ajouter</button>
                  </form>
                  <form action={dismissDiscovery.bind(null, d.id)}>
                    <button className="text-xs text-faint hover:text-text">Ignorer</button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Empty>Rien de nouveau. Une base Notion partagée avec l&apos;intégration, une équipe Linear ou un agenda apparaîtra ici.</Empty>
        )}
      </Section>

      {(Object.keys(KIND_TITLE) as Source["kind"][]).map((kind) => {
        const list = sources.filter((s) => s.kind === kind);
        return (
          <Section key={kind} title={KIND_TITLE[kind]} count={list.length}>
            <Card>
              <ul className="divide-y divide-border">
                {list.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                    <form action={toggleSource.bind(null, s.id, !s.enabled)}>
                      <button
                        title={s.enabled ? "Désactiver" : "Activer"}
                        className={`relative h-4 w-7 rounded-full transition-colors ${s.enabled ? "bg-accent" : "bg-border"}`}
                      >
                        <span className={`absolute top-0.5 size-3 rounded-full bg-surface transition-all ${s.enabled ? "left-3.5" : "left-0.5"}`} />
                      </button>
                    </form>
                    <span className={`min-w-0 flex-1 truncate ${s.enabled ? "" : "text-faint"}`}>
                      {s.name}
                      <span className="ml-2 text-xs text-faint">
                        {ROLE_LABEL[s.role]}
                        {s.config.projectName && <> → {s.config.projectName}</>}
                        {s.config.calendarRole && <> · {s.config.calendarRole}</>}
                      </span>
                    </span>
                    <span className={`text-xs ${s.lastSyncError ? "text-danger" : "text-faint"}`} title={s.lastSyncError ?? undefined}>
                      {s.lastSyncError
                        ? `Erreur : ${s.lastSyncError.slice(0, 70)}`
                        : s.lastSyncAt
                          ? `${s.lastSyncCount ?? 0} éléments · ${formatRelative(s.lastSyncAt)}`
                          : "jamais synchronisé"}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        );
      })}

      <Section title="Ajouter une base Notion">
        <Card className="p-4">
          <form action={addNotionSource} className="grid gap-3 sm:grid-cols-2">
            <input name="url" required placeholder="URL de la base ou de la page Notion" className={`${input} sm:col-span-2`} />
            <input name="name" placeholder="Nom affiché (ex. Projet X · Tâches)" className={input} />
            <select name="role" defaultValue="tasks" className={input}>
              <option value="tasks">Base de tâches</option>
              <option value="projects">Base de projets</option>
              <option value="milestones">Base de jalons</option>
            </select>
            <input name="projectName" list="projects" placeholder="Projet du Cockpit rattaché (optionnel)" className={input} />
            <datalist id="projects">
              {projects.map((p) => (
                <option key={p.name} value={p.name} />
              ))}
            </datalist>
            <button className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">Ajouter la source</button>
          </form>
          <p className="mt-3 text-xs text-faint">
            La page doit être partagée avec l&apos;intégration Notion (••• → Connexions). Les champs titre, statut et date sont détectés automatiquement.
          </p>
        </Card>
      </Section>
    </>
  );
}
