// Fictional dataset for `npm run demo`: a final-year engineering student's life,
// with every date relative to today so the screens always look current.
// Nothing here comes from a real account.
import { db, schema } from "./index";
import { addDays, parisDay } from "@/lib/dates";
import { computePriority, projectScaleFromLevel } from "@/engine/priority";

const today = parisDay();
const day = (n: number) => addDays(today, n);
const now = new Date().toISOString();
// Paris is UTC+1 in winter and UTC+2 in summer: good enough for demo timestamps.
const at = (n: number, hhmm: string) => new Date(`${day(n)}T${hhmm}:00+01:00`).toISOString();

const pillars = [
  ["etudes", "Études", "blue"],
  ["carriere", "Carrière", "purple"],
  ["projets", "Projets perso", "orange"],
  ["assos", "Assos", "pink"],
  ["sport", "Sport & Bien-être", "green"],
  ["musique", "Musique", "yellow"],
  ["vie-perso", "Vie perso", "gray"],
] as const;

const levels = [
  ["socle", "Socle", "Non négociable : sport, sommeil.", "Placé en premier", null],
  ["p1", "P1", "Les priorités qui font avancer la saison.", "Blocs de deep work dédiés", 3],
  ["p2", "P2", "Important mais secondaire cette saison.", "1 à 2 blocs par semaine", null],
  ["maintenance", "Maintenance", "On garde en vie, sans viser l'excellence.", "1 créneau fourre-tout par semaine", null],
  ["en-attente", "En attente", "Rien à faire tant qu'un événement extérieur n'arrive pas.", "Aucune", null],
] as const;

const sources = [
  ["notion-projets", "notion", "projects", "Notion · Projets", 9],
  ["notion-jalons", "notion", "milestones", "Notion · Jalons", 6],
  ["notion-taches", "notion", "tasks", "Notion · Tâches perso", 7],
  ["notion-cours", "notion", "tasks", "Notion · Cours & rendus", 4],
  ["linear-covoit", "linear", "tasks", "Linear · Covoit'", 4],
  ["gcal-principal", "gcal", "events", "Principal", 3],
  ["gcal-travail", "gcal", "events", "Travail", 2],
  ["gcal-sport", "gcal", "events", "Sport", 1],
  ["gcal-cours", "gcal", "events", "Cours", 3],
] as const;

// Course deliverables are graded: due within 48 h they become Urgent.
const gradedSources = new Set(["notion-cours"]);
// Task type per source: drives the learned minutes per point.
const sourceType: Record<string, string> = { "notion-cours": "études", "linear-covoit": "développement" };

const calendarRole: Record<string, "travail" | "socle" | "cours" | "engagement"> = {
  "gcal-principal": "engagement",
  "gcal-travail": "travail",
  "gcal-sport": "socle",
  "gcal-cours": "cours",
};

// [id, name, pillar, level, météo, next action, next due offset]
const projects = [
  ["marathon", "Marathon de Lyon", "sport", "socle", "🟢", "Sortie longue 24 km dimanche", 34],
  ["sommeil", "Sommeil", "sport", "socle", "🟡", "Écrans off à 23 h, 5 soirs sur 7", null],
  ["memoire", "Mémoire de fin d'études", "etudes", "p1", "🟡", "Finir l'état de l'art avant la mi-parcours", 5],
  ["stage", "Candidatures stage de fin d'études", "carriere", "p1", "🟢", "Envoyer 3 candidatures ciblées cette semaine", 12],
  ["covoit", "Covoit' (side project)", "projets", "p1", "🟢", "Corriger la géolocalisation avant la bêta", 20],
  ["album", "EP lo-fi", "musique", "p2", "🟢", "Mixer la piste 3", 40],
  ["photo", "Club photo", "assos", "maintenance", "🟢", null, null],
  ["admin", "Admin & santé", "vie-perso", "maintenance", "🟡", "Résilier l'ancienne box internet", null],
  ["erasmus", "Semestre d'échange", "etudes", "en-attente", "🟡", "Attendre la réponse de l'université", null],
] as const;

type T = [source: string, title: string, project: string | null, due: number | null, status: "todo" | "doing", raw: string, extra?: { id?: string; mine?: boolean; who?: string }];
const tasks: T[] = [
  ["notion-cours", "Rendre le TP Kubernetes", "memoire", -1, "doing", "En cours"],
  ["notion-taches", "Prendre rendez-vous chez le kiné", "admin", 0, "todo", "À faire"],
  ["notion-cours", "Préparer les slides de mi-parcours", "memoire", 1, "todo", "À faire"],
  ["linear-covoit", "Fix : position GPS figée en arrière-plan", "covoit", 2, "doing", "In Progress", { id: "COV-14", mine: true }],
  ["notion-taches", "Candidature AI Engineer · Lumen Labs", "stage", 3, "todo", "À faire"],
  ["notion-taches", "Plan d'entraînement semaine 6", "marathon", 4, "todo", "À faire"],
  ["notion-cours", "Lire les 3 papiers sur le RAG hybride", "memoire", 6, "todo", "À faire"],
  ["notion-taches", "Mixer la piste 3", "album", 9, "todo", "À faire"],
  ["notion-taches", "Résilier l'ancienne box internet", "admin", null, "todo", "À faire"],
  ["notion-taches", "Exposition du club : choisir 12 tirages", "photo", 15, "todo", "À faire"],
  ["notion-cours", "Réviser l'EV de réseaux", "memoire", 8, "todo", "À faire"],
  ["linear-covoit", "Écran d'onboarding", "covoit", 3, "doing", "In Progress", { id: "COV-17", who: "Hugo" }],
  ["linear-covoit", "Notifications push", "covoit", 10, "todo", "Todo", { id: "COV-19" }],
  ["linear-covoit", "Page de paiement Stripe", "covoit", 14, "todo", "Todo", { id: "COV-21", mine: true }],
];

const milestones = [
  ["Soutenance de mi-parcours", 5, "Évaluation", false],
  ["Clôture des candidatures d'été", 12, "Carrière", false],
  ["Bêta Covoit' sur TestFlight", 20, "Projet", false],
  ["Marathon de Lyon", 34, "Sport", false],
  ["Sortie de l'EP", 40, "Musique", true],
  ["Vacances de Noël", 55, "Perso", false],
] as const;

const events: [string, string, string, string, number?][] = [
  ["gcal-sport", "Course · fractionné 10 × 400 m", "07:15", "08:00"],
  ["gcal-cours", "CM Systèmes distribués", "09:00", "10:30"],
  ["gcal-travail", "Mémoire : rédaction état de l'art", "14:00", "15:30"],
  ["gcal-principal", "Club photo · réunion", "18:30", "19:30"],
  ["gcal-travail", "🧭 Revue quotidienne", "22:45", "23:00"],
  ["gcal-cours", "TD Sécurité des réseaux", "10:00", "12:00", 1],
  ["gcal-principal", "Dîner chez Léa", "20:00", "22:30", 2],
];

async function main() {
  await db.insert(schema.pillars).values(pillars.map(([id, name, color], i) => ({ id, name, color, sortOrder: i })));
  await db.insert(schema.levels).values(
    levels.map(([id, name, description, weeklyRule, maxProjects], i) => ({ id, name, description, weeklyRule, maxProjects, sortOrder: i })),
  );
  await db.insert(schema.seasons).values({ id: "saison", name: "Dernière ligne droite", startDate: day(-40), endDate: day(60), notes: "Mémoire, stage, marathon" });

  await db.insert(schema.sources).values(
    sources.map(([id, kind, role, name, count]) => ({
      id, kind, role, name,
      externalRef: `demo-${id}`,
      config: kind === "gcal" ? { calendarRole: calendarRole[id] } : { ...(gradedSources.has(id) ? { graded: true } : {}), ...(id === "linear-covoit" ? { teamKey: "COV" } : {}), ...(sourceType[id] ? { taskType: sourceType[id] } : {}) },
      lastSyncAt: now,
      lastSyncCount: count,
    })),
  );

  const levelName = (levelId: string) => levels.find((l) => l[0] === levelId)![1];
  const scaleOf = new Map<string, ReturnType<typeof projectScaleFromLevel>>(projects.map(([id, , , levelId]) => [id, projectScaleFromLevel(levelName(levelId))]));
  await db.insert(schema.projects).values(
    projects.map(([id, name, pillarId, levelId, meteo, nextAction, due]) => ({
      id: `notion-projets:${id}`, sourceId: "notion-projets", externalId: id, name, pillarId, levelId, meteo, nextAction,
      nextDue: due === null ? null : day(due), syncedAt: now, ...scaleOf.get(id)!,
    })),
  );

  // Linear priorities (1 Urgent … 4 Basse) and estimates for the demo tickets; efforts for a few Notion rows.
  const linearPriority: Record<string, number> = { "COV-14": 2, "COV-17": 3, "COV-19": 4, "COV-21": 3 };
  const efforts: Record<number, number> = { 0: 1, 2: 3, 3: 2, 4: 3, 5: 5, 6: 5, 7: 3, 11: 3, 12: 5, 13: 8 };
  await db.insert(schema.tasks).values(
    tasks.map(([sourceId, title, project, due, status, statusRaw, extra = {}], i) => {
      const isLinear = sourceId.startsWith("linear");
      const computed = computePriority({
        sourceKind: isLinear ? "linear" : "notion",
        sourcePriority: isLinear ? (linearPriority[extra.id ?? ""] ?? 0) : null,
        projectPriority: project ? scaleOf.get(project)!.priority : null,
        dueDate: due === null ? null : day(due),
        today,
        graded: gradedSources.has(sourceId),
      });
      return {
        id: `${sourceId}:t${i}`, sourceId, externalId: `t${i}`, identifier: extra.id ?? null, title, status, statusRaw,
        dueDate: due === null ? null : day(due),
        projectId: project ? `notion-projets:${project}` : null,
        assignedToMe: isLinear ? Boolean(extra.mine) : null,
        assigneeName: extra.mine ? "Camille" : (extra.who ?? null),
        priority: computed.priority,
        priorityAuto: computed.auto,
        effort: efforts[i] ?? null,
        taskType: sourceType[sourceId] ?? null,
        syncedAt: now,
      };
    }),
  );

  await db.insert(schema.routingRules).values([
    { id: "rule-kine", pattern: "kiné", sourceId: "notion-taches", projectId: "notion-projets:admin", sortOrder: 1 },
    { id: "rule-tp", pattern: "re:^TP ", sourceId: "notion-cours", projectId: "notion-projets:memoire", sortOrder: 2 },
    { id: "rule-default", pattern: "*", sourceId: "notion-taches", projectId: null, sortOrder: 99 },
  ]);
  await db.insert(schema.inbox).values([
    { id: "inbox-1", text: "Renouveler l'abonnement transport vendredi", kind: "task", title: "Renouveler l'abonnement transport", dueDate: day(((5 - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7) || 7), suggestedSourceId: "notion-taches", note: null, createdAt: now },
    { id: "inbox-2", text: "idée : playlist pour les sorties longues", kind: "idea", title: "playlist pour les sorties longues", note: "Aucun dossier de coffre configuré (VAULT_INBOX_PATH) : l'idée reste ici.", createdAt: now },
    { id: "inbox-3", text: "rdv : dentiste jeudi 14h", kind: "event", title: "dentiste", dueDate: day(((4 - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7) || 7), dueTime: "14:00", note: "Les événements restent ici jusqu'à l'écriture dans l'agenda.", createdAt: now },
  ]);
  await db.insert(schema.changeLog).values({
    at: now, entity: "task", entityId: "notion-taches:t1", label: "Prendre rendez-vous chez le kiné", field: "dueDate",
    before: day(1), after: day(0), source: "notion-taches", response: "démo : base locale uniquement",
  });

  await db.insert(schema.milestones).values(
    milestones.map(([name, offset, type, approximate], i) => ({
      id: `notion-jalons:m${i}`, sourceId: "notion-jalons", externalId: `m${i}`, name, startDate: day(offset), type, approximate, syncedAt: now,
    })),
  );

  await db.insert(schema.events).values([
    ...events.map(([sourceId, title, start, end, offset = 0], i) => ({
      id: `${sourceId}:e${i}`, sourceId, externalId: `e${i}`, title, start: at(offset, start), end: at(offset, end), allDay: false, day: day(offset), syncedAt: now,
    })),
    { id: "gcal-cours:ev", sourceId: "gcal-cours", externalId: "ev", title: "EV Réseaux", start: at(9, "08:00"), end: at(9, "10:00"), allDay: false, day: day(9), isExam: true, syncedAt: now },
  ]);

  // Task types (one learned, one rated once, "rédaction" still to be asked) and blocks around now.
  await db.insert(schema.taskTypes).values([
    { id: "etudes", name: "études", minutesPerPoint: 35, samples: 4 },
    { id: "developpement", name: "développement", minutesPerPoint: 45, samples: 2 },
  ]);
  const MIN = 60_000;
  const rel = (m: number) => new Date(Date.now() + m * MIN).toISOString();
  const blocks: { id: string; title: string; start: string; end: string; task: string | null; status: "planned" | "missed" | "done"; origin: "cockpit" | "calendar"; type: string | null; effort: number | null; description?: string }[] = [
    { id: "b0", title: "Rendre le TP Kubernetes", start: at(-1, "14:00"), end: at(-1, "15:30"), task: "notion-cours:t0", status: "missed", origin: "cockpit", type: "études", effort: 3, description: "cockpit:task=notion-cours:t0" },
    { id: "b1", title: "Fix : ancien ticket", start: at(-1, "10:00"), end: at(-1, "11:30"), task: "linear-covoit:closed", status: "done", origin: "cockpit", type: "développement", effort: 3 },
    { id: "b2", title: "Préparer les slides de mi-parcours", start: rel(-20), end: rel(40), task: "notion-cours:t2", status: "planned", origin: "cockpit", type: "rédaction", effort: 2, description: "cockpit:task=notion-cours:t2" },
    { id: "b3", title: "COV-14 Fix position GPS figée", start: rel(90), end: rel(180), task: "linear-covoit:t3", status: "planned", origin: "calendar", type: "développement", effort: 3 },
    { id: "b4", title: "Plan d'entraînement semaine 6", start: at(1, "09:30"), end: at(1, "11:00"), task: "notion-taches:t5", status: "planned", origin: "cockpit", type: null, effort: 5, description: "cockpit:task=notion-taches:t5" },
    { id: "b5", title: "Atelier admin", start: at(1, "16:00"), end: at(1, "17:00"), task: null, status: "planned", origin: "calendar", type: null, effort: null },
  ];
  await db.insert(schema.events).values(
    blocks.map((b) => ({ id: `gcal-travail:${b.id}`, sourceId: "gcal-travail", externalId: b.id, title: b.title, start: b.start, end: b.end, allDay: false, day: parisDay(b.start), description: b.description ?? null, syncedAt: now })),
  );
  await db.insert(schema.blocks).values(
    blocks.map((b) => ({
      id: `gcal-travail:${b.id}`, sourceId: "gcal-travail", externalId: b.id, title: b.title, start: b.start, end: b.end, taskId: b.task, status: b.status, origin: b.origin,
      estimateMin: Math.round((Date.parse(b.end) - Date.parse(b.start)) / MIN), effort: b.effort, taskType: b.type, updatedAt: now,
    })),
  );
  // A day with a clash: an association evening (avoided) and a class (protected) tomorrow.
  await db.insert(schema.events).values([
    { id: "gcal-principal:soiree", sourceId: "gcal-principal", externalId: "soiree", title: "Soirée de l'asso", start: at(1, "18:00"), end: at(1, "21:00"), allDay: false, day: day(1), syncedAt: now },
  ]);
  await db.insert(schema.blockLog).values({ at: now, blockId: "gcal-travail:b0", action: "status", before: { status: "planned" }, after: { status: "missed" }, reason: "Bloc terminé" });

  await db.insert(schema.discoveries).values([
    { id: "notion:demo-lectures", kind: "notion", externalRef: "demo-lectures", name: "Lectures", foundAt: now },
    { id: "gcal:demo-asso", kind: "gcal", externalRef: "demo-asso", name: "Club photo · agenda", foundAt: now },
  ]);
  await db.insert(schema.settings).values({ key: "last_sync", value: now });

  console.log(`Demo data ready for ${today}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
