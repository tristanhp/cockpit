import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchTag, parseCapture, ruleMatches, suggestDestination } from "./capture";

// 2026-10-26 is a Monday.
const T = "2026-10-26";
const p = (s: string) => parseCapture(s, T);

describe("parseCapture dates", () => {
  it("reads aujourd'hui", () => assert.equal(p("Appeler le kiné aujourd'hui").due, T));
  it("reads ajd", () => assert.equal(p("Payer le loyer ajd").due, T));
  it("reads demain", () => assert.equal(p("Envoyer le CV demain").due, "2026-10-27"));
  it("reads après-demain", () => assert.equal(p("Relire le rapport après-demain").due, "2026-10-28"));
  it("reads a weekday as the next occurrence", () => assert.equal(p("Rendre le TP vendredi").due, "2026-10-30"));
  it("reads today's weekday as next week", () => assert.equal(p("Réunion lundi").due, "2026-11-02"));
  it("reads sunday", () => assert.equal(p("Sortie longue dimanche").due, "2026-11-01"));
  it("reads 'lundi prochain'", () => assert.equal(p("Rendre le dossier lundi prochain").due, "2026-11-02"));
  it("reads dd/mm in the future", () => assert.equal(p("Dépôt dossier 12/11").due, "2026-11-12"));
  it("rolls a past dd/mm to next year", () => assert.equal(p("Anniversaire 03/02").due, "2027-02-03"));
  it("reads dd/mm/yyyy", () => assert.equal(p("Inscription 05/01/2027").due, "2027-01-05"));
  it("ignores an impossible date", () => assert.equal(p("Truc 31/02").due, null));
  it("reads dans N jours", () => assert.equal(p("Relancer dans 3 jours").due, "2026-10-29"));
  it("reads dans N semaines", () => assert.equal(p("Bilan dans 2 semaines").due, "2026-11-09"));
  it("is accent-insensitive", () => assert.equal(p("Finir le TP Apres-Demain").due, "2026-10-28"));
  it("leaves undated text alone", () => assert.equal(p("Acheter du pain").due, null));
});

describe("parseCapture hours and titles", () => {
  it("reads vendredi 18h", () => {
    const r = p("Dîner avec Hugo vendredi 18h");
    assert.equal(r.due, "2026-10-30");
    assert.equal(r.time, "18:00");
    assert.equal(r.title, "Dîner avec Hugo");
  });
  it("reads 18h30", () => assert.equal(p("Cours demain 18h30").time, "18:30"));
  it("reads 9:15", () => assert.equal(p("Standup demain 9:15").time, "09:15"));
  it("a bare hour means today", () => {
    const r = p("Appeler maman 20h");
    assert.equal(r.due, T);
    assert.equal(r.time, "20:00");
  });
  it("removes the date words from the title", () => assert.equal(p("Rendre le TP Kubernetes vendredi").title, "Rendre le TP Kubernetes"));
  it("keeps a clean title for a plain task", () => assert.equal(p("  Acheter du pain  ").title, "Acheter du pain"));
});

describe("parseCapture tags and kinds", () => {
  it("extracts tags", () => {
    const r = p("Lire le papier RAG #memoire demain");
    assert.deepEqual(r.tags, ["memoire"]);
    assert.equal(r.title, "Lire le papier RAG");
  });
  it("extracts several tags, with accents", () => assert.deepEqual(p("Truc #mémoire #covoit").tags, ["mémoire", "covoit"]));
  it("does not take a mid-word hash as a tag", () => assert.deepEqual(p("Ticket#12 à voir").tags, []));
  it("detects ideas", () => assert.equal(p("idée : un widget météo").kind, "idea"));
  it("detects events", () => assert.equal(p("rdv : dentiste jeudi 14h").kind, "event"));
  it("defaults to a task", () => assert.equal(p("Faire les courses").kind, "task"));
  it("strips the kind prefix from the title", () => assert.equal(p("idée : un widget météo").title, "un widget météo"));
});

const projects = [
  { id: "m", name: "Mémoire de fin d'études" },
  { id: "c", name: "Covoit' (side project)" },
  { id: "co", name: "Comité des fêtes" },
  { id: "s", name: "Sommeil" },
];

describe("matchTag", () => {
  it("matches a word prefix", () => assert.equal(matchTag("memoire", projects)?.id, "m"));
  it("matches with accents and case", () => assert.equal(matchTag("Mémoire", projects)?.id, "m"));
  it("refuses an ambiguous tag", () => assert.equal(matchTag("co", projects), null));
  it("matches a unique longer prefix", () => assert.equal(matchTag("covo", projects)?.id, "c"));
  it("returns null when nothing fits", () => assert.equal(matchTag("xyz", projects), null));
});

describe("suggestDestination", () => {
  const sources = [
    { id: "notion-taches", kind: "notion" as const },
    { id: "linear-covoit", kind: "linear" as const, ticketPattern: "COV" },
  ];
  const ctx = (rules = [] as { pattern: string; sourceId: string; projectId: string | null }[]) => ({
    rules, projects, sources, sourceOfProject: (id: string) => (id === "m" ? "notion-taches" : null),
  });
  it("files by tag", () => assert.deepEqual(suggestDestination(p("Lire #memoire"), ctx()), { sourceId: "notion-taches", projectId: "m", why: "tag" }));
  it("files by ticket pattern", () => assert.equal(suggestDestination(p("Fix COV-21 paiement"), ctx())?.sourceId, "linear-covoit"));
  it("an explicit rule wins", () => {
    const d = suggestDestination(p("Lire #memoire"), ctx([{ pattern: "#memoire", sourceId: "linear-covoit", projectId: null }]));
    assert.equal(d?.why, "rule");
  });
  it("returns null when nothing is obvious", () => assert.equal(suggestDestination(p("Acheter du pain"), ctx()), null));
  it("ignores a tag whose project has no source", () => assert.equal(suggestDestination(p("Dormir #sommeil"), ctx()), null));
  it("matches a regex rule", () => assert.equal(ruleMatches("re:^TP ", { title: "TP réseaux", tags: [] }), true));
  it("matches a keyword rule on title words", () => assert.equal(ruleMatches("kiné", { title: "Appeler le kiné", tags: [] }), true));
});
