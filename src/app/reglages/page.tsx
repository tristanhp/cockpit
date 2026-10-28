import { Suspense } from "react";
import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Source } from "@/db/schema";
import { formatDayCompact, formatRelative } from "@/lib/dates";
import { PRIORITY_LABEL } from "@/engine/priority";
import { hasWriteScope } from "@/connectors/gcal";
import { connectors, isDemo } from "@/sync";
import { addNotionSource, addRoutingRule, adoptDiscovery, deleteRoutingRule, discoverNow, dismissDiscovery, toggleSource } from "@/app/actions";
import { UndoButton } from "@/components/undo-button";
import { NotificationsPanel } from "@/components/notifications-panel";
import { RitualTimes } from "@/components/ritual-times";
import { ExportGoals } from "@/components/export-goals";
import { ReviewSettingsForm } from "@/components/review-settings";
import { SeasonSettingsForm } from "@/components/season-settings";
import { loadSeasonSettings } from "@/season";
import { loadReviewSettings } from "@/review";
import { loadRitualSettings } from "@/rituals/settings";
import { SecurityPanel } from "@/components/security-panel";
import { authDisabled } from "@/lib/auth/session";
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
  const [passkeys, devices, rituals, reviewSettings, seasonSettings] = await Promise.all([db.select().from(schema.credentials), db.select().from(schema.pushSubscriptions), loadRitualSettings(), loadReviewSettings(), loadSeasonSettings()]);
  const [sources, discoveries, projects, journal, rules] = await Promise.all([
    db.select().from(schema.sources),
    db.select().from(schema.discoveries).where(eq(schema.discoveries.dismissed, false)),
    db.select({ id: schema.projects.id, name: schema.projects.name }).from(schema.projects),
    db.select().from(schema.changeLog).orderBy(desc(schema.changeLog.at), desc(schema.changeLog.id)).limit(50),
    db.select().from(schema.routingRules).orderBy(schema.routingRules.sortOrder),
  ]);
  const taskSources = sources.filter((s) => s.role === "tasks");
  const FIELD_LABEL: Record<string, string> = { done: "statut", dueDate: "échéance", priority: "priorité", effort: "effort", meteo: "météo", nextAction: "prochaine action", nextDue: "échéance", status: "statut", create: "création" };
  const show = (field: string, v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    if (field === "priority") return PRIORITY_LABEL[Number(v)] ?? String(v);
    if (field === "done") return v ? "terminée" : "ouverte";
    if ((field === "dueDate" || field === "nextDue") && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) return formatDayCompact(String(v));
    return String(v);
  };
  const demo = isDemo();
  const setup = Object.fromEntries(
    await Promise.all(Object.values(connectors).map(async (c) => [c.kind, demo ? null : await c.missingSetup()] as const)),
  ) as Record<Source["kind"], string | null>;
  const needsWrite = !demo && !setup.gcal && !(await hasWriteScope());

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

          <div id="journal">
            <Section title="Journal des changements" count={journal.length} aside="50 derniers">
              {journal.length ? (
                <ul>
                  {journal.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-rule py-2.5 text-sm last:border-b-0">
                      <span className="w-24 shrink-0 font-mono text-xs tabular-nums text-ink-faint" title={c.at}>{formatRelative(c.at)}</span>
                      <span className={`min-w-0 flex-1 ${c.undone ? "text-ink-faint line-through" : ""}`}>
                        {c.label}
                        <span className="ml-2 text-xs text-ink-faint">
                          {c.source === "sync" ? "conflit · " : ""}
                          {FIELD_LABEL[c.field] ?? c.field}
                          {c.field !== "create" && <> : {show(c.field, c.before)} → {show(c.field, c.after)}</>}
                        </span>
                      </span>
                      <span className="text-xs text-ink-faint" title={c.response ?? undefined}>{c.source === "cockpit" ? "Cockpit" : c.source === "sync" ? "synchro" : (sources.find((s) => s.id === c.source)?.name ?? c.source)}</span>
                      {!c.undone && c.source !== "sync" && c.field !== "create" ? <UndoButton id={c.id} /> : c.undone ? <span className="text-xs text-ink-faint">annulé</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Aucun changement pour l&apos;instant.</Empty>
              )}
            </Section>
          </div>

          <Section title="Règles de rangement" count={rules.length} aside="capture → destination">
            {rules.length > 0 && (
              <ul>
                {rules.map((r) => (
                  <li key={r.id} className="flex items-baseline gap-3 border-b border-rule py-2 text-sm last:border-b-0">
                    <code className="font-mono text-xs">{r.pattern}</code>
                    <span className="min-w-0 flex-1 truncate text-ink-soft">
                      → {sources.find((s) => s.id === r.sourceId)?.name ?? r.sourceId}
                      {r.projectId && <> · {projects.find((p) => p.id === r.projectId)?.name}</>}
                    </span>
                    <form action={deleteRoutingRule.bind(null, r.id)}>
                      <button className="text-xs text-ink-faint hover:text-ink">Retirer</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={addRoutingRule} className="mt-3 flex flex-wrap items-center gap-2">
              <input id="rule-pattern" name="pattern" required placeholder="mot, #tag ou re:motif" className={`${input} w-44`} />
              <select id="rule-source" name="sourceId" className={`${input} w-auto`} defaultValue={taskSources[0]?.id}>
                {taskSources.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select id="rule-project" name="projectId" className={`${input} w-auto`} defaultValue="">
                <option value="">Sans projet</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button className={ghostButton}>Ajouter</button>
            </form>
            <p className="mt-2 text-xs text-ink-faint">Le motif <code className="font-mono">*</code> sert de destination suggérée pour tout ce qui n&apos;a pas de règle ; il n&apos;est jamais rangé tout seul.</p>
          </Section>
        </div>

        <aside className="min-w-0">
          <Section title="Sécurité" count={authDisabled() ? undefined : passkeys.length}>
            {authDisabled() ? (
              <p className="py-2 text-xs text-ink-faint">Authentification désactivée (mode démo ou COCKPIT_AUTH=off).</p>
            ) : (
              <>
                <ul>
                  {passkeys.map((c) => (
                    <li key={c.id} className="flex items-baseline gap-3 border-b border-rule py-2 text-sm last:border-b-0">
                      <span className="min-w-0 flex-1 truncate">{c.label ?? "Passkey"}</span>
                      <span className="font-mono text-xs text-ink-faint">{c.createdAt.slice(0, 10)}</span>
                    </li>
                  ))}
                </ul>
                <SecurityPanel />
              </>
            )}
          </Section>

          <Section title="Rituels" aside="le cap et la clôture">
            <RitualTimes settings={rituals} />
          </Section>

          <Section title="La revue" aside="jour, heure et budget">
            <ReviewSettingsForm settings={reviewSettings} />
          </Section>

          <Section title="La saison" aside="seuils et coupe">
            <SeasonSettingsForm settings={seasonSettings} />
          </Section>

          <Section title="Export des objectifs" aside="Markdown pour le coffre">
            <ExportGoals configured={Boolean(process.env.VAULT_GOALS_PATH)} />
          </Section>

          <Section title="Notifications" count={devices.length}>
            <NotificationsPanel publicKey={process.env.VAPID_PUBLIC_KEY ?? null} devices={devices.map((d) => ({ id: d.id, label: d.label, createdAt: d.createdAt }))} />
          </Section>

          <Section title="Connexions">
            <ul>
              {(Object.keys(KIND_TITLE) as Source["kind"][]).map((kind) => (
                <li key={kind} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule py-2.5 text-sm last:border-b-0">
                  <span className={`size-2 rounded-full ${setup[kind] ? "bg-warn" : "bg-ok"}`} />
                  <span className="flex-1">{KIND_TITLE[kind]}</span>
                  {kind === "gcal" && !demo && process.env.GOOGLE_CLIENT_ID && (
                    <a href="/api/google/auth" className={ghostButton}>{setup.gcal ? "Connecter" : "Reconnecter"}</a>
                  )}
                  {kind === "gcal" && needsWrite && (
                    <a href="/api/google/auth" className={`${ghostButton} border-warn text-warn`}>Reconnecter pour autoriser l&apos;écriture</a>
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
