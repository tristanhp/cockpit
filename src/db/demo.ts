// Fictional dataset for `npm run demo`: a final-year engineering student's life,
// with every date relative to today so the screens always look current.
// Nothing here comes from a real account.
import { db, schema } from "./index";
import { addDays, parisDay } from "@/lib/dates";

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
      config: kind === "gcal" ? { calendarRole: calendarRole[id] } : {},
      lastSyncAt: now,
      lastSyncCount: count,
    })),
  );

  await db.insert(schema.projects).values(
    projects.map(([id, name, pillarId, levelId, meteo, nextAction, due]) => ({
      id: `notion-projets:${id}`, sourceId: "notion-projets", externalId: id, name, pillarId, levelId, meteo, nextAction,
      nextDue: due === null ? null : day(due), syncedAt: now,
    })),
  );

  await db.insert(schema.tasks).values(
    tasks.map(([sourceId, title, project, due, status, statusRaw, extra = {}], i) => ({
      id: `${sourceId}:t${i}`, sourceId, externalId: `t${i}`, identifier: extra.id ?? null, title, status, statusRaw,
      dueDate: due === null ? null : day(due),
      projectId: project ? `notion-projets:${project}` : null,
      assignedToMe: sourceId.startsWith("linear") ? Boolean(extra.mine) : null,
      assigneeName: extra.mine ? "Camille" : (extra.who ?? null),
      syncedAt: now,
    })),
  );

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
