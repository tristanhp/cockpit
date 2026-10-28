import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSnapshot, diffSnapshots, findClashes, isEmptyDiff, missedTwoWeeks, pickFirstAction, suggestTop3, weekStart, weeklyPct, type Candidate, type SnapEvent } from "./cloture";

const task = (id: string, o: Partial<Candidate> = {}): Candidate => ({ id, title: id, priority: 3, dueDate: null, effort: null, ...o });

describe("three priorities", () => {
  it("never returns more than three", () => {
    const tasks = ["a", "b", "c", "d", "e"].map((id) => task(id, { priority: 1 }));
    assert.equal(suggestTop3(tasks, "2026-11-03").length, 3);
  });
  it("keeps only Urgent, Haute or due by the day", () => {
    const tasks = [task("moyenne", { priority: 3 }), task("basse-due", { priority: 4, dueDate: "2026-11-03" }), task("haute", { priority: 2 }), task("later", { priority: 4, dueDate: "2026-11-20" })];
    assert.deepEqual(suggestTop3(tasks, "2026-11-03").map((t) => t.id), ["basse-due", "haute"]);
  });
  it("puts what is due first, then priority, then the nearest date", () => {
    const tasks = [
      task("haute-later", { priority: 2, dueDate: "2026-11-09" }),
      task("urgent", { priority: 1 }),
      task("late", { priority: 3, dueDate: "2026-11-01" }),
      task("haute-soon", { priority: 2, dueDate: "2026-11-05" }),
    ];
    assert.deepEqual(suggestTop3(tasks, "2026-11-03").map((t) => t.id), ["late", "urgent", "haute-soon"]);
  });
  it("is empty when nothing is pressing", () => assert.deepEqual(suggestTop3([task("a")], "2026-11-03"), []));
});

describe("première action", () => {
  it("prefers the first easy one", () => {
    const top = [task("big", { effort: 8 }), task("small", { effort: 2 }), task("tiny", { effort: 1 })];
    assert.equal(pickFirstAction(top)?.id, "small");
  });
  it("falls back to the first when none is easy or sized", () => {
    assert.equal(pickFirstAction([task("big", { effort: 8 }), task("unsized")])?.id, "big");
  });
  it("is null without priorities", () => assert.equal(pickFirstAction([]), null));
});

const ev = (id: string, start: string, end: string, kind: SnapEvent["kind"] = "protected"): SnapEvent => ({ id, title: id, start: `2026-11-03T${start}:00.000Z`, end: `2026-11-03T${end}:00.000Z`, kind });

describe("clashes", () => {
  it("finds a block over a protected event", () => assert.deepEqual(findClashes([ev("b", "09:00", "10:00", "block"), ev("c", "09:30", "11:00")]), ["b|c"]));
  it("ignores touching events and two blocks", () => {
    assert.deepEqual(findClashes([ev("b", "09:00", "10:00", "block"), ev("c", "10:00", "11:00")]), []);
    assert.deepEqual(findClashes([ev("b", "09:00", "10:00", "block"), ev("b2", "09:30", "10:30", "block")]), []);
  });
});

describe("overnight diff", () => {
  const base = () => buildSnapshot({ from: "2026-11-03", days: 7, tasks: [{ id: "t1", title: "Rendu", due: "2026-11-05" }], events: [ev("b", "09:00", "10:00", "block"), ev("c", "14:00", "15:00")] });

  it("is empty when nothing changed", () => assert.ok(isEmptyDiff(diffSnapshots(base(), base()))));

  it("reports new and changed tickets", () => {
    const now = base();
    now.tasks = [{ id: "t1", title: "Rendu", due: "2026-11-04" }, { id: "t2", title: "Nouveau", due: null }];
    const d = diffSnapshots(base(), now);
    assert.deepEqual(d.newTasks.map((t) => t.id), ["t2"]);
    assert.deepEqual(d.changedTasks, [{ id: "t1", title: "Rendu", from: "2026-11-05", to: "2026-11-04" }]);
  });

  it("reports a moved event and the clash it creates", () => {
    const now = buildSnapshot({ from: "2026-11-03", days: 7, tasks: base().tasks, events: [ev("b", "09:00", "10:00", "block"), ev("c", "09:30", "10:30")] });
    const d = diffSnapshots(base(), now);
    assert.equal(d.movedEvents[0].id, "c");
    assert.deepEqual(d.newClashes, [{ block: "b", event: "c" }]);
  });

  it("does not repeat a clash that was already there", () => {
    const clashing = buildSnapshot({ from: "2026-11-03", days: 7, tasks: [], events: [ev("b", "09:00", "10:00", "block"), ev("c", "09:30", "10:30")] });
    assert.deepEqual(diffSnapshots(clashing, clashing).newClashes, []);
  });

  it("reports an event added overnight", () => {
    const now = buildSnapshot({ from: "2026-11-03", days: 7, tasks: base().tasks, events: [...base().events, ev("n", "16:00", "17:00")] });
    assert.deepEqual(diffSnapshots(base(), now).newEvents.map((e) => e.id), ["n"]);
  });

  it("ignores days only one of the snapshots covers", () => {
    const prev = base();
    const next = buildSnapshot({ from: "2026-11-04", days: 7, tasks: prev.tasks, events: [{ ...ev("far", "09:00", "10:00"), start: "2026-11-11T09:00:00.000Z", end: "2026-11-11T10:00:00.000Z" }] });
    assert.deepEqual(diffSnapshots(prev, next).newEvents, []);
  });
});

describe("habit percentage", () => {
  // 2026-11-02 is a Monday.
  const days = (n: number, from = "2026-11-02") => Array.from({ length: n }, (_, i) => ({ day: `2026-11-${String(Number(from.slice(8)) + i).padStart(2, "0")}`, done: true }));

  it("finds the Monday of a week", () => assert.equal(weekStart("2026-11-08"), "2026-11-02"));
  it("counts a finished week over seven days", () => {
    assert.equal(weeklyPct(days(6), "2026-11-02", "2026-11-09"), 86);
    assert.equal(weeklyPct(days(7), "2026-11-02", "2026-11-09"), 100);
  });
  it("measures a running week on the days that passed", () => assert.equal(weeklyPct(days(2), "2026-11-02", "2026-11-03"), 100));
  it("ignores undone logs and other weeks", () => {
    const logs = [...days(3), { day: "2026-11-05", done: false }, { day: "2026-10-28", done: true }];
    assert.equal(weeklyPct(logs, "2026-11-02", "2026-11-09"), 43);
  });
  it("is 0 before the week starts", () => assert.equal(weeklyPct(days(3), "2026-11-09", "2026-11-03"), 0));
  it("treats 80 % as a full week", () => assert.ok(weeklyPct(days(6), "2026-11-02", "2026-11-09") >= 80));

  describe("jamais deux fois de suite", () => {
    const today = "2026-11-18"; // Wednesday; the finished weeks start 2026-11-02 and 2026-11-09
    const week = (start: string, n: number) => Array.from({ length: n }, (_, i) => ({ day: new Date(Date.parse(start) + i * 86_400_000).toISOString().slice(0, 10), done: true }));
    it("flags two weeks under target", () => assert.ok(missedTwoWeeks([...week("2026-11-02", 3), ...week("2026-11-09", 2)], 80, today)));
    it("is quiet when one of the two weeks made it", () => assert.ok(!missedTwoWeeks([...week("2026-11-02", 3), ...week("2026-11-09", 6)], 80, today)));
    it("is quiet when a week was not tracked at all", () => assert.ok(!missedTwoWeeks(week("2026-11-09", 2), 80, today)));
    it("does not count the running week", () => assert.ok(!missedTwoWeeks([...week("2026-11-02", 7), ...week("2026-11-09", 7), ...week("2026-11-16", 0)], 80, today)));
  });
});
