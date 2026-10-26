import { Suspense } from "react";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Source } from "@/db/schema";
import { formatRelative } from "@/lib/dates";
import { connectors, isDemo } from "@/sync";
import { addNotionSource, adoptDiscovery, discoverNow, dismissDiscovery, toggleSource } from "@/app/actions";
import { Empty, PageHeader, Section } from "@/components/ui";

const KIND_TITLE: Record<Source["kind"], string> = { notion: "Notion", linear: "Linear", gcal: "Google Agenda" };
const ROLE_LABEL: Record<Source["role"], string> = { tasks: "tâches", projects: "projets", milestones: "jalons", reviews: "revues", events: "événements" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="font-serif italic text-ink-faint">Ouverture du carnet…</p>}>
      <Settings />
    </Suspense>
  );
}

const input = "w-full rounded-md border border-rule-strong bg-paper px-3 py-2 text-sm placeholder:text-ink-faint focus:border-accent focus:outline-none";
const ghostButton = "rounded-md border border-rule-strong px-2.5 py-1 text-xs hover:border-accent hover:text-accent";

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

  return (
    <>
      <PageHeader
        eyebrow="les sources du carnet"
        title="Réglages"
        subtitle="Ajouter une base, un agenda ou une équipe ne demande aucun code."
      />

      <div className="grid gap-x-14 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {(Object.keys(KIND_TITLE) as Source["kind"][]).map((kind) => {
            const list = sources.filter((s) => s.kind === kind);
            return (
              <Section key={kind} title={KIND_TITLE[kind]} count={list.length}>
                <ul>
                  {list.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-rule py-2.5 last:border-b-0">
                      <form action={toggleSource.bind(null, s.id, !s.enabled)}>
                        <button
                          title={s.enabled ? "Désactiver" : "Activer"}
                          aria-pressed={s.enabled}
                          className={`relative h-[18px] w-8 rounded-full border transition-colors ${s.enabled ? "border-accent bg-accent" : "border-rule-strong bg-paper-2"}`}
                        >
                          <span className={`absolute top-[2px] size-3 rounded-full transition-all ${s.enabled ? "left-[15px] bg-paper" : "left-[2px] bg-ink-faint"}`} />
                        </button>
                      </form>
                      <span className={`min-w-0 flex-1 truncate ${s.enabled ? "" : "text-ink-faint"}`}>
                        {s.name}
                        <span className="ml-2 text-xs text-ink-faint">
                          {ROLE_LABEL[s.role]}
                          {s.config.projectName && <> → {s.config.projectName}</>}
                          {s.config.calendarRole && <> · {s.config.calendarRole}</>}
                        </span>
                      </span>
                      <span className={`w-full pl-11 text-xs sm:w-auto sm:pl-0 ${s.lastSyncError ? "text-margin" : "text-ink-faint"}`} title={s.lastSyncError ?? undefined}>
                        {s.lastSyncError
                          ? s.lastSyncError.slice(0, 80)
                          : s.lastSyncAt
                            ? `${s.lastSyncCount ?? 0} élément${(s.lastSyncCount ?? 0) > 1 ? "s" : ""} · ${formatRelative(s.lastSyncAt)}`
                            : "jamais synchronisé"}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            );
          })}
        </div>

        <aside className="min-w-0">
          <Section title="Connexions">
            <ul>
              {(Object.keys(KIND_TITLE) as Source["kind"][]).map((kind) => (
                <li key={kind} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule py-2.5 text-sm last:border-b-0">
                  <span className={`size-2 rounded-full ${setup[kind] ? "bg-warn" : "bg-ok"}`} />
                  <span className="flex-1">{KIND_TITLE[kind]}</span>
                  {kind === "gcal" && !demo && process.env.GOOGLE_CLIENT_ID && (
                    <a href="/api/google/auth" className={ghostButton}>{setup.gcal ? "Connecter" : "Reconnecter"}</a>
                  )}
                  <span className="w-full pl-5 text-xs text-ink-faint">{demo ? "Mode démo : données fictives" : (setup[kind] ?? "Connecté")}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="Détectées"
            count={discoveries.length}
            aside={
              <form action={async () => { "use server"; await discoverNow(); }}>
                <button className="text-accent hover:underline">détecter</button>
              </form>
            }
          >
            {discoveries.length ? (
              <ul>
                {discoveries.map((d) => (
                  <li key={d.id} className="border-b border-rule py-2.5 last:border-b-0">
                    <div className="flex items-baseline gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{d.name}</span>
                      <span className="smallcaps text-xs text-ink-faint">{KIND_TITLE[d.kind]}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <form action={adoptDiscovery} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={d.id} />
                        {d.kind === "notion" && (
                          <select name="role" id={`role-${d.id}`} defaultValue="tasks" className="rounded-md border border-rule-strong bg-paper px-1.5 py-1 text-xs">
                            <option value="tasks">Tâches</option>
                            <option value="projects">Projets</option>
                            <option value="milestones">Jalons</option>
                          </select>
                        )}
                        <button className={ghostButton}>Ajouter</button>
                      </form>
                      <form action={dismissDiscovery.bind(null, d.id)}>
                        <button className="text-xs text-ink-faint hover:text-ink">Ignorer</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Rien de nouveau dans tes outils.</Empty>
            )}
          </Section>

          <Section title="Ajouter une base Notion">
            <form action={addNotionSource} className="mt-3 grid gap-2.5">
              <input id="notion-url" name="url" required placeholder="URL de la base ou de la page" className={input} />
              <input id="notion-name" name="name" placeholder="Nom affiché" className={input} />
              <select id="notion-role" name="role" defaultValue="tasks" className={input}>
                <option value="tasks">Base de tâches</option>
                <option value="projects">Base de projets</option>
                <option value="milestones">Base de jalons</option>
              </select>
              <input id="notion-project" name="projectName" list="projects" placeholder="Projet rattaché (optionnel)" className={input} />
              <datalist id="projects">
                {projects.map((p) => (
                  <option key={p.name} value={p.name} />
                ))}
              </datalist>
              <button className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-paper hover:opacity-90">Ajouter la source</button>
              <p className="text-xs text-ink-faint">
                Partage d&apos;abord la page avec l&apos;intégration (••• → Connexions). Titre, statut et date sont détectés automatiquement.
              </p>
            </form>
          </Section>
        </aside>
      </div>
    </>
  );
}
