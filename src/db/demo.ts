// Fictional dataset for `npm run demo`: a final-year engineering student's life,
// with every date relative to today so the screens always look current.
// Nothing here comes from a real account.
import { db, schema } from "./index";
import { addDays, isoWeekday, parisDay } from "@/lib/dates";
import { buildSnapshot, weekStart } from "@/engine/cloture";
import { computeAwards, POINTS, resultOf, table as seasonTotals, type Played } from "@/engine/season";
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
    { id: "b6", title: "Relire l'état de l'art", start: at(-3, "10:00"), end: at(-3, "11:30"), task: "notion-cours:t6", status: "done", origin: "cockpit", type: "études", effort: 3 },
    { id: "b7", title: "Slides : plan général", start: at(-3, "14:00"), end: at(-3, "15:00"), task: "notion-cours:t2", status: "done", origin: "cockpit", type: "études", effort: 2 },
    { id: "b8", title: "Plan d'entraînement semaine 5", start: at(-2, "09:30"), end: at(-2, "11:00"), task: "notion-taches:t5", status: "missed", origin: "cockpit", type: null, effort: 3 },
    { id: "b9", title: "Mixer la piste 2", start: at(-2, "15:00"), end: at(-2, "16:00"), task: "notion-taches:t7", status: "missed", origin: "cockpit", type: null, effort: 2 },
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

  // Habits and three weeks of logs: one habit has missed the last two full weeks ("jamais deux fois de suite").
  await db.insert(schema.habits).values([
    { id: "sommeil-minuit", name: "Au lit avant minuit", protected: true, sortOrder: 0 },
    { id: "lecture", name: "Lecture 20 minutes", sortOrder: 1 },
    { id: "etirements", name: "Étirements", sortOrder: 2 },
  ]);
  const week0 = weekStart(today);
  const pattern: Record<string, (week: number, dow: number) => boolean> = {
    "sommeil-minuit": (w, d) => (w === -1 ? d !== 5 && d !== 6 : d !== 6),
    lecture: (_w, d) => d !== 4,
    etirements: (w, d) => (w <= -3 ? d <= 5 : d === 1 || d === 4),
  };
  const logs: (typeof schema.habitLogs.$inferInsert)[] = [];
  for (let n = -56; n < 0; n++) {
    const d = addDays(week0, n);
    if (d >= today) continue;
    const week = Math.floor(n / 7);
    for (const [habitId, done] of Object.entries(pattern)) logs.push({ habitId, day: d, done: done(week, isoWeekday(d)) });
  }
  // Days of the current week before today are logged too.
  for (let n = 0; addDays(week0, n) < today; n++) {
    const d = addDays(week0, n);
    for (const [habitId, done] of Object.entries(pattern)) logs.push({ habitId, day: d, done: done(0, isoWeekday(d)) });
  }
  await db.insert(schema.habitLogs).values(logs).onConflictDoNothing();

  // Vision, a year and season goals: a milestones goal, a number goal with nothing planned (sans fil),
  // a stalled project (à l'arrêt), a paused habit goal and a priority project with no goal (Covoit').
  await db.insert(schema.vision).values({
    id: "main",
    identity: ["Quelqu'un qui finit ce qu'il commence", "Un corps entretenu, une tête reposée", "Curieux, jamais pressé"],
    horizon: "Dans cinq ans : un métier choisi plutôt que subi, un marathon courant en moins de quatre heures, un projet à moi qui tourne.",
    rules: ["Trois objectifs par saison, pas un de plus", "Les habitudes protégées ne se négocient pas", "Capturer d'abord, trier le soir"],
    updatedAt: now,
  });
  await db.insert(schema.years).values({ id: "annee", theme: "L'année de la bascule", motto: "Un pas après l'autre", startDate: day(-60), endDate: day(300) });
  await db.insert(schema.goals).values([
    { id: "g-stage", title: "Décrocher un stage de fin d'études", horizon: "year", yearId: "annee", measure: "boolean", pillarId: "carriere", status: "active", sortOrder: 0 },
    { id: "g-photo", title: "Faire vivre le club photo", horizon: "year", yearId: "annee", measure: "boolean", pillarId: "assos", status: "active", sortOrder: 1 },
    { id: "g-memoire", title: "Soutenir le mémoire", horizon: "season", seasonId: "saison", measure: "milestones", pillarId: "etudes", status: "active", dueDate: day(40), sortOrder: 2 },
    { id: "g-candidatures", title: "Envoyer dix candidatures ciblées", horizon: "season", seasonId: "saison", parentGoalId: "g-stage", measure: "number", target: 10, current: 3, unit: "candidatures", pillarId: "carriere", status: "active", sortOrder: 3 },
    { id: "g-sorties", title: "Tenir les sorties longues du plan", horizon: "season", seasonId: "saison", measure: "number", target: 8, current: 5, unit: "sorties", pillarId: "sport", status: "active", sortOrder: 4 },
    { id: "g-lecture", title: "Lire un peu chaque jour", horizon: "season", seasonId: "saison", measure: "habit", pillarId: "vie-perso", status: "paused", sortOrder: 5 },
  ]);
  await db.insert(schema.goalLinks).values([
    { goalId: "g-stage", kind: "project", refId: "notion-projets:stage" },
    { goalId: "g-photo", kind: "project", refId: "notion-projets:photo" },
    { goalId: "g-memoire", kind: "project", refId: "notion-projets:memoire" },
    { goalId: "g-memoire", kind: "milestone", refId: "notion-jalons:m0" },
    { goalId: "g-candidatures", kind: "project", refId: "notion-projets:stage" },
    { goalId: "g-candidatures", kind: "milestone", refId: "notion-jalons:m1" },
    { goalId: "g-sorties", kind: "milestone", refId: "notion-jalons:m3" },
    { goalId: "g-lecture", kind: "habit", refId: "lecture" },
  ]);

  // Four weeks of metrics (velocity 9 points, so a budget of 9) and two finished reviews: the sleep target was
  // missed two weeks running and less than 60 % of the blocks were kept last week and this one ("jamais deux fois de suite").
  const mk = (n: number, m: { pointsDone: number; pointsPlanned: number; blocksKept: number; blocksPlanned: number; ritualsDone: number; sportDone: number; sportPlanned: number }) =>
    ({ weekStart: addDays(week0, -7 * n), ...m, computedAt: now });
  await db.insert(schema.weeklyMetrics).values([
    mk(1, { pointsDone: 10, pointsPlanned: 19, blocksKept: 5, blocksPlanned: 10, ritualsDone: 6, sportDone: 3, sportPlanned: 3 }),
    mk(2, { pointsDone: 6, pointsPlanned: 12, blocksKept: 7, blocksPlanned: 11, ritualsDone: 5, sportDone: 3, sportPlanned: 3 }),
    mk(3, { pointsDone: 12, pointsPlanned: 14, blocksKept: 9, blocksPlanned: 10, ritualsDone: 6, sportDone: 3, sportPlanned: 3 }),
    mk(4, { pointsDone: 8, pointsPlanned: 13, blocksKept: 7, blocksPlanned: 9, ritualsDone: 6, sportDone: 2, sportPlanned: 3 }),
    mk(5, { pointsDone: 9, pointsPlanned: 12, blocksKept: 8, blocksPlanned: 10, ritualsDone: 5, sportDone: 3, sportPlanned: 3 }),
    mk(6, { pointsDone: 5, pointsPlanned: 11, blocksKept: 4, blocksPlanned: 9, ritualsDone: 4, sportDone: 1, sportPlanned: 3 }),
    mk(7, { pointsDone: 11, pointsPlanned: 13, blocksKept: 9, blocksPlanned: 11, ritualsDone: 6, sportDone: 3, sportPlanned: 3 }),
  ]);

  // La saison: a past season and the current one, with a generated history of matches (a pseudo-random but fixed
  // pattern, so the demo is always the same), the table, the player card, goal progress lines and the recap.
  await db.insert(schema.seasons).values({ id: "printemps", name: "Printemps", startDate: day(-140), endDate: day(-41), notes: "Cours, projet de groupe" });
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const history = (from: number, to: number, bias: number, seasonId: string, cupDay?: [number, string]) => {
    const out: (typeof schema.matches.$inferInsert)[] = [];
    for (let n = from; n <= to; n++) {
      if (isoWeekday(day(n)) === 7 && rand() < 0.7) continue; // most Sundays are off
      const ratio = Math.min(1, Math.max(0.2, Math.round((bias + (rand() - 0.5) * 0.7) * 100) / 100));
      const result = resultOf(ratio);
      const planned = 8 + Math.floor(rand() * 8);
      const kept = Math.round(ratio * 4);
      const cup = cupDay?.[0] === n;
      const k = cup ? 2 : 1;
      out.push({
        day: day(n), seasonId, plannedPoints: planned, donePoints: Math.round(planned * ratio), blocksPlanned: 4, blocksKept: kept, ritualsPlanned: 2, ritualsDone: ratio > 0.5 ? 2 : 1,
        mandatoryMissed: ratio < 0.6 ? 1 : 0, goalsFor: k * (Math.round(planned * ratio * 0.6) + kept), goalsAgainst: k * (ratio < 0.6 ? 1 : 0), ratio, result, points: POINTS[result],
        cup, cupTitle: cup ? cupDay![1] : null, computedAt: now,
      });
    }
    return out;
  };
  const spring = history(-140, -41, 0.68, "printemps", [-95, "Partiels de mars"]);
  const autumn = history(-40, -4, 0.74, "saison", [-17, "EV Systèmes"]);
  // The last three days are what the nightly pass derives from the blocks above: a draw, then two losses (a crise).
  const lastDays: (typeof schema.matches.$inferInsert)[] = [
    { day: day(-3), ratio: 0.7778, plannedPoints: 9, donePoints: 7, blocksPlanned: 2, blocksKept: 2, ritualsPlanned: 2, ritualsDone: 0, mandatoryMissed: 0, goalsFor: 7, goalsAgainst: 0, result: "N", points: 1 },
    { day: day(-2), ratio: 0, plannedPoints: 9, donePoints: 0, blocksPlanned: 2, blocksKept: 0, ritualsPlanned: 2, ritualsDone: 0, mandatoryMissed: 0, goalsFor: 0, goalsAgainst: 0, result: "D", points: 0 },
    { day: day(-1), ratio: 0.5, plannedPoints: 10, donePoints: 5, blocksPlanned: 2, blocksKept: 1, ritualsPlanned: 2, ritualsDone: 1, mandatoryMissed: 1, goalsFor: 5, goalsAgainst: 1, result: "D", points: 0 },
  ].map((m) => ({ ...m, seasonId: "saison", cup: false, cupTitle: null, computedAt: now }) as typeof schema.matches.$inferInsert);
  autumn.push(...lastDays);
  await db.insert(schema.matches).values([...spring, ...autumn]);
  const asPlayed = (rows: typeof spring): Played[] => rows.map((m) => ({ day: m.day, result: m.result as "V" | "N" | "D", goalsFor: m.goalsFor, goalsAgainst: m.goalsAgainst }));
  for (const [seasonId, rows] of [["printemps", spring], ["saison", autumn]] as const) {
    const t = seasonTotals(asPlayed(rows));
    await db.insert(schema.seasonTable).values({ seasonId, played: t.played, points: t.points, wins: t.wins, draws: t.draws, losses: t.losses, goalsFor: t.goalsFor, goalsAgainst: t.goalsAgainst });
  }
  // The current season's last matches (days -3 to -1) are re-derived from the blocks by the nightly pass.
  // The card is re-derived on every sync; last week's ratings are what the derivation gave a week earlier, so deltas stay small.
  const playerCard: Record<string, [number, number]> = { etudes: [47, 47], carriere: [18, 18], projets: [60, 58], assos: [5, 5], sport: [30, 30], "vie-perso": [52, 52], musique: [10, 10] };
  await db.insert(schema.ratings).values(Object.entries(playerCard).flatMap(([pillarId, [now_, before]]) => [{ pillarId, weekStart: week0, rating: now_ }, { pillarId, weekStart: addDays(week0, -7), rating: before }]));
  const lines: Record<string, number[]> = { "g-candidatures": [10, 10, 20, 20, 30, 30], "g-sorties": [25, 38, 38, 50, 63, 63] };
  await db.insert(schema.goalSnapshots).values(Object.entries(lines).flatMap(([goalId, pcts]) => pcts.map((pct, i) => ({ goalId, weekStart: addDays(week0, -7 * (pcts.length - 1 - i)), pct }))));
  const recap = computeAwards({
    matches: asPlayed(spring),
    pillarRatings: [{ name: "Études", rating: 77 }, { name: "Sport & Bien-être", rating: 71 }, { name: "Carrière", rating: 60 }],
    projectPoints: [{ name: "Mémoire de fin d'études", points: 64 }, { name: "Covoit' (side project)", points: 52 }],
  });
  await db.insert(schema.awards).values(recap.map((a) => ({ id: `award-printemps-${a.kind}`, seasonId: "printemps", ...a, createdAt: now })));
  await db.insert(schema.reviews).values([
    {
      id: `review-${addDays(week0, -7)}`, kind: "weekly", weekStart: addDays(week0, -7), status: "done", createdAt: at(-8, "19:30"), completedAt: at(-8, "19:45"),
      data: {
        step: 4, numbers: { sleepAvg: "6 h 40", bedtimesOnTarget: 4, energy: 3, win: "Candidature envoyée" },
        focus: [{ projectId: "notion-projets:memoire", name: "Mémoire de fin d'études", result: "Finir le plan détaillé" }, { projectId: "notion-projets:stage", name: "Candidatures stage de fin d'études", result: "Envoyer 2 candidatures" }],
      },
    },
    {
      id: `review-${addDays(week0, -14)}`, kind: "weekly", weekStart: addDays(week0, -14), status: "done", createdAt: at(-15, "19:30"), completedAt: at(-15, "19:50"),
      data: { step: 4, numbers: { sleepAvg: "6 h 20", bedtimesOnTarget: 3, energy: 3, win: "Mi-parcours préparé" } },
    },
  ]);

  // Yesterday's clôture, with the state of the evening: since then a ticket arrived, a due date moved
  // and a training block slid into a class (the cap's "Depuis hier soir").
  const taskRows = await db.select().from(schema.tasks);
  const eventRows = await db.select().from(schema.events);
  const writable = new Set(["gcal-travail"]);
  const evening = buildSnapshot({
    from: day(-1),
    days: 7,
    tasks: taskRows
      .filter((t) => t.id !== "linear-covoit:t13")
      .map((t) => ({ id: t.id, title: t.title, due: t.id === "notion-taches:t4" && t.dueDate ? addDays(t.dueDate, 1) : t.dueDate })),
    events: eventRows
      .filter((e) => !e.allDay)
      .map((e) => {
        const moved = e.id === "gcal-travail:b4";
        return {
          id: e.id, title: e.title, kind: writable.has(e.sourceId) ? ("block" as const) : e.sourceId === "gcal-principal" ? ("avoided" as const) : ("protected" as const),
          start: moved ? at(1, "08:00") : e.start, end: moved ? at(1, "09:30") : e.end,
        };
      }),
  });
  await db.insert(schema.dayPlans).values([
    { day: day(-1), closedAt: at(-1, "22:50"), snapshot: evening, top3: [] },
    { day: today, top3: ["notion-cours:t0", "notion-cours:t2", "linear-covoit:t3"], firstActionTaskId: "linear-covoit:t3" },
  ]);

  console.log(`Demo data ready for ${today}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
