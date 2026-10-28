import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS, freeSlots, type BusyEvent } from "./planning";
import { addDays, isoWeekday, parisInstant } from "@/lib/dates";
import { budgetFor, computeMetrics, load, nextSlotFor, proposeWeek, reviewAlerts, reviewMarkdown, velocity, type ProposeInput, type WeekRecord, type WeekTask } from "./week";

const WEEK = "2026-11-02"; // a Monday
const NOW = parisInstant("2026-11-01", 19 * 60 + 30); // the Sunday-evening revue
const days = Array.from({ length: 7 }, (_, i) => addDays(WEEK, i));
const at = (day: string, hhmm: string) => parisInstant(day, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));
const dayOf = (ms: number) => days.find((d) => ms >= parisInstant(d, 0) && ms < parisInstant(addDays(d, 1), 0));

const task = (id: string, priority: number | null, o: Partial<WeekTask> = {}): WeekTask => ({ id, title: id, priority, dueDate: null, effort: 2, minutes: 60, ...o });
const input = (tasks: WeekTask[], o: Partial<ProposeInput> = {}, events: BusyEvent[] = []): ProposeInput => ({
  weekStart: WEEK, tasks, reservations: [], slots: freeSlots(events, days, DEFAULT_SETTINGS), budget: 20, alreadyPlanned: 0, now: NOW, ...o,
});

describe("velocity and budget", () => {
  it("is the median of the last four weeks", () => {
    assert.equal(velocity([4, 10, 6, 8]), 7);
    assert.equal(velocity([100, 4, 10, 6, 9]), 7.5);
    assert.equal(velocity([5, 9, 7]), 7);
  });
  it("is 0 without history", () => assert.equal(velocity([]), 0));
  it("never drops below the minimum", () => {
    assert.equal(budgetFor(3, 8), 8);
    assert.equal(budgetFor(12, 8), 12);
  });
  it("warns only when overcommitted", () => {
    assert.equal(load(8, 8).message, null);
    assert.match(load(11, 8).message ?? "", /11 points.*budget de 8/);
    assert.deepEqual([load(11, 8).over, load(8, 8).over, load(4, 8).ratio], [true, false, 0.5]);
  });
});

describe("weekly metrics", () => {
  const blocks = [
    { status: "done", effort: 3, end: 1 },
    { status: "done", effort: 2, end: 2 },
    { status: "missed", effort: 5, end: 3 },
    { status: "planned", effort: 8, end: 1000 },
    { status: "dropped", effort: 8, end: 4 },
  ];
  it("counts points and blocks that are due", () => {
    const m = computeMetrics({ blocks, closedDays: 5, sport: [{ start: 0, end: 10 }, { start: 2000, end: 2100 }], now: 100 });
    assert.deepEqual(m, { pointsDone: 5, pointsPlanned: 18, blocksKept: 2, blocksPlanned: 3, ritualsDone: 5, sportDone: 1, sportPlanned: 2 });
  });
});

describe("jamais deux fois de suite", () => {
  const week = (o: Partial<WeekRecord> = {}): WeekRecord => ({ tracked: true, revueDone: true, ritualsDone: 6, sportDone: 3, sportPlanned: 3, bedtimesOnTarget: 6, blocksKept: 8, blocksPlanned: 10, ...o });
  const kinds = (before: WeekRecord, last: WeekRecord, w: WeekRecord) => reviewAlerts({ before, last, week: w }).map((a) => a.kind);

  it("is quiet when everything held", () => assert.deepEqual(kinds(week(), week(), week()), []));
  it("revue: missed two weeks running", () => {
    assert.deepEqual(kinds(week({ revueDone: false }), week({ revueDone: false }), week()), ["revue"]);
    assert.deepEqual(kinds(week({ revueDone: false }), week(), week()), []);
  });
  it("clôture: under four days two weeks running", () => {
    assert.deepEqual(kinds(week(), week({ ritualsDone: 3 }), week({ ritualsDone: 2 })), ["cloture"]);
    assert.deepEqual(kinds(week(), week({ ritualsDone: 3 }), week({ ritualsDone: 4 })), []);
  });
  it("sport: below plan two weeks running", () => {
    assert.deepEqual(kinds(week(), week({ sportDone: 1 }), week({ sportDone: 2 })), ["sport"]);
    assert.deepEqual(kinds(week(), week({ sportDone: 1 }), week()), []);
    assert.deepEqual(kinds(week(), week({ sportPlanned: 0, sportDone: 0 }), week({ sportDone: 1 })), []);
  });
  it("sommeil: bedtimes under target two weeks running", () => {
    assert.deepEqual(kinds(week({ bedtimesOnTarget: 3 }), week({ bedtimesOnTarget: 4 }), week()), ["sommeil"]);
    assert.deepEqual(kinds(week({ bedtimesOnTarget: null }), week({ bedtimesOnTarget: 4 }), week()), []);
  });
  it("blocs: under 60 % two weeks running", () => {
    assert.deepEqual(kinds(week(), week({ blocksKept: 5 }), week({ blocksKept: 4 })), ["blocs"]);
    assert.deepEqual(kinds(week(), week({ blocksKept: 6 }), week({ blocksKept: 4 })), []);
    assert.deepEqual(kinds(week(), week({ blocksKept: 0, blocksPlanned: 0 }), week({ blocksKept: 0, blocksPlanned: 0 })), []);
  });
  it("never accuses an untracked week", () => {
    const untracked = week({ tracked: false, revueDone: false, ritualsDone: 0, sportDone: 0, blocksKept: 0 });
    assert.deepEqual(kinds(untracked, untracked, untracked), []);
  });
});

describe("the proposed week", () => {
  it("respects the work window and never uses Sunday", () => {
    const p = proposeWeek(input(Array.from({ length: 12 }, (_, i) => task(`t${i}`, 3, { effort: 1 })), { budget: 100 }));
    assert.ok(p.blocks.length > 0);
    for (const b of p.blocks) {
      assert.notEqual(isoWeekday(dayOf(b.start)!), 7, "no Sunday");
      assert.ok(b.start >= at(dayOf(b.start)!, "09:00") && b.end <= at(dayOf(b.start)!, "22:00"), "inside 9-22");
      assert.ok(b.start >= parisInstant(WEEK, 0), "inside the week");
    }
  });
  it("leaves protected slots alone", () => {
    const events: BusyEvent[] = days.map((d, i) => ({ id: `p${i}`, start: at(d, "09:00"), end: at(d, "20:00"), kind: "protected" }));
    const p = proposeWeek(input([task("a", 2), task("b", 2)], {}, events));
    for (const b of p.blocks) assert.ok(b.start >= at(dayOf(b.start)!, "20:00"), "only after the protected stretch");
  });
  it("never overlaps two blocks", () => {
    const p = proposeWeek(input(Array.from({ length: 10 }, (_, i) => task(`t${i}`, 2)), { budget: 100 }));
    const sorted = [...p.blocks].sort((a, b) => a.start - b.start);
    for (let k = 1; k < sorted.length; k++) assert.ok(sorted[k].start >= sorted[k - 1].end);
  });
  it("stays within the point budget and drops Basse work first", () => {
    const tasks = [task("basse", 4, { effort: 3 }), task("haute", 2, { effort: 3 }), task("moyenne", 3, { effort: 3 }), task("urgent", 1, { effort: 3 })];
    const p = proposeWeek(input(tasks, { budget: 9 }));
    assert.deepEqual(p.blocks.map((b) => b.taskId).sort(), ["haute", "moyenne", "urgent"]);
    assert.deepEqual(p.unplaced.map((u) => u.id), ["basse"]);
    assert.equal(p.planned, 9);
    assert.equal(p.load.over, false);
  });
  it("once something does not fit, lower priorities are dropped too", () => {
    const tasks = [task("haute-big", 2, { effort: 8 }), task("basse-small", 4, { effort: 1 })];
    const p = proposeWeek(input(tasks, { budget: 5 }));
    assert.deepEqual(p.blocks, []);
    assert.deepEqual(p.unplaced.map((u) => u.id), ["haute-big", "basse-small"]);
  });
  it("always places Urgent work, even over the budget, and says so", () => {
    const p = proposeWeek(input([task("u1", 1, { effort: 8 }), task("u2", 1, { effort: 8 })], { budget: 8 }));
    assert.equal(p.blocks.length, 2);
    assert.equal(p.load.over, true);
    assert.match(p.load.message ?? "", /16 points/);
  });
  it("counts blocks already on the calendar against the budget", () => {
    const p = proposeWeek(input([task("a", 3, { effort: 3 })], { budget: 8, alreadyPlanned: 6 }));
    assert.deepEqual(p.blocks, []);
  });
  it("reserves one block for each goal without a thread", () => {
    const p = proposeWeek(input([task("a", 2)], { reservations: [{ goalId: "g1", title: "Fil : Marathon", minutes: 60 }] }));
    const goal = p.blocks.find((b) => b.goalId === "g1");
    assert.ok(goal);
    assert.equal(goal!.taskId, null);
    assert.equal(goal!.points, 0);
  });
  it("places work before its due date when it can", () => {
    const p = proposeWeek(input([task("rendu", 2, { dueDate: addDays(WEEK, 1) })]));
    assert.ok(p.blocks[0].end <= parisInstant(addDays(WEEK, 2), 0));
    assert.match(p.blocks[0].reason, /avant l'échéance/);
  });
  it("does not use a slot that overlaps an avoided event without approval", () => {
    const events: BusyEvent[] = days.map((d, i) => ({ id: `soiree${i}`, start: at(d, "09:00"), end: at(d, "22:00"), kind: "avoided" }));
    assert.deepEqual(proposeWeek(input([task("a", 2)], {}, events)).blocks, []);
    const approved = proposeWeek(input([task("a", 2)], { allowAvoided: events.map((e) => e.id) }, events));
    assert.equal(approved.blocks.length, 1);
  });
  it("never plans in the past", () => {
    const midweek = parisInstant(addDays(WEEK, 2), 15 * 60);
    const p = proposeWeek(input([task("a", 2)], { now: midweek }));
    assert.ok(p.blocks[0].start >= midweek);
  });
  it("reports work that has no room", () => {
    const events: BusyEvent[] = days.map((d, i) => ({ id: `p${i}`, start: at(d, "09:00"), end: at(d, "22:00"), kind: "protected" }));
    const p = proposeWeek(input([task("a", 2)], {}, events));
    assert.deepEqual(p.unplaced.map((u) => u.reason), ["aucun créneau libre cette semaine"]);
  });
  it("is deterministic", () => {
    const tasks = [task("a", 2), task("b", 3), task("c", 4)];
    assert.deepEqual(proposeWeek(input(tasks)), proposeWeek(input(tasks)));
  });
});

describe("another slot", () => {
  it("moves a block to the next later slot", () => {
    const slots = freeSlots([], days, DEFAULT_SETTINGS);
    const block = { start: at(WEEK, "09:00"), end: at(WEEK, "10:00"), priority: 3, dueDate: null };
    const next = nextSlotFor(block, slots, NOW, WEEK);
    assert.ok(next && next.start >= block.end);
  });
});

describe("Markdown summary", () => {
  it("writes the review", () => {
    const md = reviewMarkdown({
      weekStart: WEEK, weekNumber: 45, metrics: { pointsDone: 12, pointsPlanned: 15, blocksKept: 7, blocksPlanned: 9, ritualsDone: 5, sportDone: 2, sportPlanned: 3 },
      numbers: { sleepAvg: "7 h 10", bedtimesOnTarget: 5, energy: 4, win: "Mémoire relu" }, focus: [{ name: "Mémoire", result: "Chapitre 2 fini" }],
      goals: [{ title: "Soutenir le mémoire", progress: "1 / 3 jalons", signal: "sur le fil" }], resume: null, proposed: [{ title: "Écrire", start: "lun. 09:00", end: "10:00" }],
    });
    for (const part of ["semaine 45", "12 / 15", "Mémoire relu", "Chapitre 2 fini", "Soutenir le mémoire : 1 / 3 jalons (sur le fil)", "Écrire"]) assert.ok(md.includes(part), part);
  });
});
