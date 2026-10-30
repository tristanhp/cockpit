import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { breakdownPrompt, goalSignals, orphanTasks, progress, projectsWithoutGoal, projectStalled, seasonLimitError, seasonMarkdown, thread, visionMarkdown, type Thread, type World } from "./goals";

const TODAY = "2026-11-02";
const ctx = (o = {}) => ({ milestoneDates: [], habitPct: null, habitTarget: null, today: TODAY, ...o });

describe("progress per measure", () => {
  it("milestones: reached over planned", () => {
    const p = progress({ measure: "milestones", target: null, current: null, unit: null, status: "active" }, ctx({ milestoneDates: ["2026-10-01", "2026-11-02", "2026-12-01", null] }));
    assert.deepEqual(p, { pct: 50, label: "2 / 4 jalons" });
  });
  it("milestones: none planned", () => assert.equal(progress({ measure: "milestones", target: null, current: null, unit: null, status: "active" }, ctx()).pct, 0));
  it("number: current over target, capped", () => {
    assert.deepEqual(progress({ measure: "number", target: 10, current: 4, unit: "km", status: "active" }, ctx()), { pct: 40, label: "4 / 10 km" });
    assert.equal(progress({ measure: "number", target: 10, current: 25, unit: null, status: "active" }, ctx()).pct, 100);
  });
  it("number: no target", () => assert.equal(progress({ measure: "number", target: null, current: 3, unit: null, status: "active" }, ctx()).pct, 0));
  it("habit: weekly percentage against the target", () => {
    assert.deepEqual(progress({ measure: "habit", target: null, current: null, unit: null, status: "active" }, ctx({ habitPct: 60, habitTarget: 80 })), { pct: 75, label: "60 % / 80 %" });
    assert.equal(progress({ measure: "habit", target: null, current: null, unit: null, status: "active" }, ctx({ habitPct: 100, habitTarget: 80 })).pct, 100);
  });
  it("habit: nothing linked", () => assert.equal(progress({ measure: "habit", target: null, current: null, unit: null, status: "active" }, ctx()).label, "aucune habitude liée"));
  it("boolean: done or not", () => {
    assert.equal(progress({ measure: "boolean", target: null, current: null, unit: null, status: "done" }, ctx()).pct, 100);
    assert.equal(progress({ measure: "boolean", target: null, current: null, unit: null, status: "active" }, ctx()).pct, 0);
  });
});

describe("the per-season limit", () => {
  const goal = (id: string, status: "active" | "paused" | "done" = "active", seasonId = "s1", horizon: "year" | "season" = "season") => ({ id, horizon, seasonId, status });
  const three = [goal("a"), goal("b"), goal("c")];
  it("refuses a fourth active goal", () => assert.match(seasonLimitError(three, goal("d")) ?? "", /3 objectifs actifs/));
  it("allows it when one is paused or done", () => {
    assert.equal(seasonLimitError([goal("a"), goal("b"), goal("c", "paused")], goal("d")), null);
    assert.equal(seasonLimitError([goal("a"), goal("b"), goal("c", "done")], goal("d")), null);
  });
  it("lets an active goal be edited in place", () => assert.equal(seasonLimitError(three, goal("c"), "c"), null));
  it("refuses to reactivate a fourth", () => assert.notEqual(seasonLimitError([...three, goal("d", "paused")], goal("d", "active"), "d"), null));
  it("counts each season on its own and ignores year goals", () => {
    assert.equal(seasonLimitError(three, goal("d", "active", "s2")), null);
    assert.equal(seasonLimitError(three, goal("y", "active", "s1", "year")), null);
  });
  it("does not apply to a goal that is not active", () => assert.equal(seasonLimitError(three, goal("d", "paused")), null));
});

const world = (o: Partial<World> = {}): World => ({
  projects: [{ id: "p1", name: "Mémoire", nextAction: "Écrire", nextDue: "2026-11-05" }],
  milestones: [{ id: "m1", name: "Soutenance", date: "2026-12-01" }],
  tasks: [
    { id: "t1", title: "Chapitre 1", projectId: "p1", dueDate: "2026-11-04" },
    { id: "t2", title: "Libre", projectId: null, dueDate: null },
    { id: "t3", title: "Autre", projectId: "p9", dueDate: "2026-11-03" },
  ],
  blocks: [{ id: "b1", title: "Écrire", taskId: "t1", start: "2026-11-03T09:00:00.000Z" }, { id: "b2", title: "Autre", taskId: "t3", start: "2026-11-03T09:00:00.000Z" }],
  habits: [{ id: "h1", name: "Lecture" }],
  ...o,
});
const links = (o = {}) => ({ projects: [], milestones: [], habits: [], tasks: [], ...o });

describe("the thread", () => {
  it("follows project membership down to blocks", () => {
    const th = thread(links({ projects: ["p1"], milestones: ["m1"] }), world());
    assert.deepEqual(th.projects[0].tasks.map((t) => t.id), ["t1"]);
    assert.deepEqual(th.blocks.map((b) => b.id), ["b1"]);
    assert.deepEqual(th.milestones.map((m) => m.id), ["m1"]);
  });
  it("adds directly linked tasks once", () => {
    const th = thread(links({ projects: ["p1"], tasks: ["t1", "t2"] }), world());
    assert.deepEqual(th.looseTasks.map((t) => t.id), ["t2"]);
  });
  it("is empty without links", () => {
    const th = thread(links(), world());
    assert.deepEqual([th.projects, th.milestones, th.looseTasks, th.blocks], [[], [], [], []]);
  });
});

describe("signals", () => {
  const th = (o: Partial<Thread> = {}): Thread => ({ projects: [], milestones: [], habits: [], looseTasks: [], blocks: [], ...o });
  const active = { status: "active" as const };
  const project = (o = {}) => ({ id: "p", name: "P", nextAction: "Faire", nextDue: null, tasks: [], ...o });
  const task = (dueDate: string | null) => ({ id: "t", title: "T", projectId: null, dueDate });

  it("sans fil: nothing planned", () => assert.deepEqual(goalSignals(active, th(), TODAY), ["sans-fil"]));
  it("sans fil: only work beyond 14 days", () => assert.deepEqual(goalSignals(active, th({ looseTasks: [task("2026-11-30")] }), TODAY), ["sans-fil"]));
  it("sans fil: undated tasks do not count", () => assert.deepEqual(goalSignals(active, th({ looseTasks: [task(null)] }), TODAY), ["sans-fil"]));
  it("a habit counts as work", () => assert.deepEqual(goalSignals(active, th({ habits: [{ id: "h", name: "H" }] }), TODAY), ["sur-le-fil"]));
  it("sur le fil: work this week", () => assert.deepEqual(goalSignals(active, th({ projects: [project({ tasks: [task("2026-11-04")] })] }), TODAY), ["sur-le-fil"]));
  it("planned in 10 days: neither sans fil nor sur le fil", () => assert.deepEqual(goalSignals(active, th({ looseTasks: [task("2026-11-12")] }), TODAY), []));
  it("a block counts as planned", () => assert.deepEqual(goalSignals(active, th({ blocks: [{ id: "b", title: "B", taskId: "t", start: "2026-11-03T09:00:00.000Z" }] }), TODAY), ["sur-le-fil"]));
  it("à l'arrêt: a stalled project", () => {
    const signals = goalSignals(active, th({ projects: [project({ nextAction: null, tasks: [task("2026-11-04")] })] }), TODAY);
    assert.deepEqual(signals, ["a-larret"]);
  });
  it("paused and done goals have no signal", () => {
    assert.deepEqual(goalSignals({ status: "paused" }, th(), TODAY), []);
    assert.deepEqual(goalSignals({ status: "done" }, th(), TODAY), []);
  });
  it("project stalled: no next action, or one more than a week overdue", () => {
    assert.ok(projectStalled({ nextAction: " ", nextDue: null }, TODAY));
    assert.ok(projectStalled({ nextAction: "x", nextDue: "2026-10-25" }, TODAY));
    assert.ok(!projectStalled({ nextAction: "x", nextDue: "2026-10-26" }, TODAY));
    assert.ok(!projectStalled({ nextAction: "x", nextDue: null }, TODAY));
  });
});

describe("threads that are missing", () => {
  it("lists tasks without a project", () => assert.deepEqual(orphanTasks(world().tasks).map((t) => t.id), ["t2"]));
  it("lists priority projects with no goal unless marked hors objectifs", () => {
    const p = (id: string, priority: number | null, o = {}) => ({ id, status: "actif", protected: false, priority, ...o });
    const projects = [p("urgent", 1), p("haute", 2), p("moyenne", 3), p("linked", 2), p("exempt", 1), p("habit", null, { protected: true }), p("paused", 2, { status: "en-attente" })];
    assert.deepEqual(projectsWithoutGoal(projects, new Set(["linked"]), new Set(["exempt"])).map((x) => x.id), ["urgent", "haute"]);
  });
});

describe("prompt and exports", () => {
  it("builds a self-contained breakdown prompt", () => {
    const text = breakdownPrompt({ title: "Finir le mémoire", measure: "milestones", target: null, unit: null, current: null }, { goalId: "g-memoire", seasonName: "Automne", dueDate: "2026-12-01", projects: ["Mémoire"], notes: null, today: TODAY });
    for (const part of ["Finir le mémoire", "jalons atteints", "Automne", "Mémoire", "sans fil", "propose_goal_breakdown", "« g-memoire »", "Propositions"]) assert.ok(text.includes(part), part);
  });
  it("writes the vision as Markdown", () => {
    const md = visionMarkdown({ identity: ["Curieux"], horizon: "Dans cinq ans…", rules: [] }, { theme: "Année de bascule", motto: "Un pas après l'autre", startDate: "2026-09-01", endDate: "2027-08-31" });
    for (const part of ["# Vision", "Année de bascule", "> Un pas après l'autre", "- Curieux", "Dans cinq ans…", "_(rien d'écrit)_"]) assert.ok(md.includes(part), part);
  });
  it("writes a season with its goals", () => {
    const md = seasonMarkdown({ name: "Automne", startDate: "2026-09-01", endDate: "2026-12-31" }, [{ title: "Marathon", status: "active", progress: { pct: 40, label: "4 / 10 km" }, pillar: "Sport", dueDate: null, notes: null, parent: null }]);
    for (const part of ["# Automne", "## Marathon", "40 %", "Pilier : Sport"]) assert.ok(md.includes(part), part);
  });
});
