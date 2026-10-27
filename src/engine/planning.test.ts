import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parisInstant } from "@/lib/dates";
import {
  DEFAULT_SETTINGS, MIN, assertWritableCalendar, canWriteCalendar, consume, durationFor, freeSlots, isMandatory, kindOfRole, learnMinutesPerPoint,
  linkedTaskId, placeSplit, placeTask, reconcileBlockStatus, replanDay, withMarker, type BusyEvent, type PlanItem, type Slot,
} from "./planning";

// 2026-11-02 is a Monday (winter time, UTC+1); 2026-11-08 is a Sunday.
const MON = "2026-11-02";
const TUE = "2026-11-03";
const SAT = "2026-11-07";
const SUN = "2026-11-08";
const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return parisInstant(day, h * 60 + m);
};
const ev = (id: string, day: string, from: string, to: string, kind: BusyEvent["kind"]): BusyEvent => ({ id, start: at(day, from), end: at(day, to), kind });
const hours = (s: { start: number; end: number }) => (s.end - s.start) / 60 / MIN;
const NOW = at(MON, "08:00");

describe("freeSlots", () => {
  it("is the whole work window on an empty day", () => {
    const s = freeSlots([], [MON]);
    assert.equal(s.length, 1);
    assert.equal(s[0].start, at(MON, "09:00"));
    assert.equal(s[0].end, at(MON, "22:00"));
  });
  it("never offers a Sunday", () => assert.deepEqual(freeSlots([], [SUN]), []));
  it("offers a Saturday", () => assert.equal(freeSlots([], [SAT]).length, 1));
  it("removes protected events", () => {
    const s = freeSlots([ev("c", MON, "10:00", "12:00", "protected")], [MON]);
    assert.deepEqual(s.map(hours), [1, 10]);
  });
  it("clips events that start before the window", () => {
    const s = freeSlots([ev("c", MON, "07:00", "10:00", "protected")], [MON]);
    assert.equal(s[0].start, at(MON, "10:00"));
  });
  it("clips events that end after the window", () => {
    const s = freeSlots([ev("c", MON, "21:00", "23:30", "protected")], [MON]);
    assert.equal(s[0].end, at(MON, "21:00"));
  });
  it("merges overlapping busy events", () => {
    const s = freeSlots([ev("a", MON, "10:00", "12:00", "busy"), ev("b", MON, "11:00", "13:00", "busy")], [MON]);
    assert.deepEqual(s.map(hours), [1, 9]);
  });
  it("tags avoided overlap instead of offering it freely", () => {
    const s = freeSlots([ev("soc", MON, "18:00", "20:00", "avoided")], [MON]);
    assert.equal(s.filter((x) => x.avoidedIds.length === 0).length, 2);
    assert.deepEqual(s.find((x) => x.avoidedIds.length)?.avoidedIds, ["soc"]);
  });
  it("covers several days", () => assert.equal(freeSlots([], [MON, TUE, SUN]).length, 2));
  it("consume splits a slot", () => {
    const s = consume(freeSlots([], [MON]), { start: at(MON, "12:00"), end: at(MON, "13:00") });
    assert.deepEqual(s.map(hours), [3, 9]);
  });
});

const slotsFor = (events: BusyEvent[] = [], days = [MON, TUE]) => freeSlots(events, days);

describe("placeTask", () => {
  it("takes the earliest slot for an urgent task", () => {
    const p = placeTask({ minutes: 90, priority: 1, dueDate: null }, slotsFor(), { now: NOW });
    assert.equal(p?.start, at(MON, "09:00"));
    assert.equal(p?.end, at(MON, "10:30"));
  });
  it("never places in the past", () => {
    const p = placeTask({ minutes: 60, priority: 2, dueDate: null }, slotsFor(), { now: at(MON, "14:07") });
    assert.equal(p?.start, at(MON, "14:15"));
  });
  it("never ends after 22:00", () => {
    const slots = slotsFor([ev("a", MON, "09:00", "20:45", "busy")], [MON]);
    assert.equal(placeTask({ minutes: 90, priority: 1, dueDate: null }, slots, { now: NOW }), null);
  });
  it("never goes over a protected event", () => {
    const slots = slotsFor([ev("c", MON, "09:00", "21:00", "protected")], [MON]);
    const p = placeTask({ minutes: 90, priority: 1, dueDate: null }, slots, { now: NOW });
    assert.equal(p, null);
  });
  it("skips Sunday entirely", () => assert.equal(placeTask({ minutes: 60, priority: 1, dueDate: null }, freeSlots([], [SUN]), { now: NOW }), null));
  it("skips a slot that is too short", () => {
    const slots = slotsFor([ev("a", MON, "10:00", "20:00", "busy")], [MON]);
    const p = placeTask({ minutes: 120, priority: 3, dueDate: null }, slots, { now: NOW });
    assert.equal(p?.start, at(MON, "20:00"));
  });
  it("does not use an avoided slot without approval", () => {
    const slots = freeSlots([ev("busy", MON, "09:00", "18:00", "busy"), ev("soc", MON, "18:00", "22:00", "avoided")], [MON]);
    assert.equal(placeTask({ minutes: 60, priority: 1, dueDate: null }, slots, { now: NOW }), null);
  });
  it("uses an avoided slot once approved", () => {
    const slots = freeSlots([ev("busy", MON, "09:00", "18:00", "busy"), ev("soc", MON, "18:00", "22:00", "avoided")], [MON]);
    const p = placeTask({ minutes: 60, priority: 1, dueDate: null }, slots, { now: NOW, allowAvoided: ["soc"] });
    assert.equal(p?.start, at(MON, "18:00"));
    assert.ok(p?.reasons.includes("chevauche un engagement validé"));
  });
  it("needs approval for every overlapped event", () => {
    const slots: Slot[] = [{ start: at(MON, "18:00"), end: at(MON, "21:00"), avoidedIds: ["a", "b"] }];
    assert.equal(placeTask({ minutes: 60, priority: 1, dueDate: null }, slots, { now: NOW, allowAvoided: ["a"] }), null);
  });
  it("prefers a slot before the due date over an earlier-scored late one", () => {
    const slots = freeSlots([], [MON, TUE]);
    const p = placeTask({ minutes: 60, priority: 3, dueDate: MON }, slots, { now: NOW });
    assert.equal(p?.late, false);
    assert.equal(p?.start, at(MON, "09:00"));
  });
  it("flags a placement that can only be late", () => {
    const slots = freeSlots([ev("a", MON, "09:00", "22:00", "busy")], [MON, TUE]);
    const p = placeTask({ minutes: 60, priority: 2, dueDate: MON }, slots, { now: NOW });
    assert.equal(p?.late, true);
  });
  it("rewards contiguity with an existing block", () => {
    const slots = freeSlots([ev("a", MON, "11:00", "12:00", "busy")], [MON]);
    const neighbours = [{ start: at(MON, "11:00"), end: at(MON, "12:00") }];
    const p = placeTask({ minutes: 60, priority: 4, dueDate: null }, slots, { now: at(MON, "09:30"), neighbours });
    assert.equal(p?.start, at(MON, "12:00"));
  });
  it("split gives two halves in different places", () => {
    const halves = placeSplit({ minutes: 120, priority: 2, dueDate: null }, slotsFor(), { now: NOW });
    assert.ok(halves);
    assert.equal(hours(halves![0]), 1);
    assert.ok(halves![1].start >= halves![0].end);
  });
});

describe("durations and learning", () => {
  it("multiplies effort by learned minutes per point", () => assert.equal(durationFor({ effort: 3 }, { minutesPerPoint: 40, samples: 2 }), 120));
  it("rounds up to 15 minutes", () => assert.equal(durationFor({ effort: 2 }, { minutesPerPoint: 22, samples: 1 }), 45));
  it("falls back to 90 minutes without a learned rate", () => assert.equal(durationFor({ effort: 3 }, { minutesPerPoint: null, samples: 0 }), 90));
  it("falls back to 90 minutes without effort", () => assert.equal(durationFor({ effort: null }, { minutesPerPoint: 30, samples: 4 }), 90));
  it("first sample sets the rate", () => assert.deepEqual(learnMinutesPerPoint({ minutesPerPoint: null, samples: 0 }, 120, 3), { minutesPerPoint: 40, samples: 1 }));
  it("later samples move it by a moving average", () => assert.deepEqual(learnMinutesPerPoint({ minutesPerPoint: 40, samples: 1 }, 200, 4), { minutesPerPoint: 43, samples: 2 }));
  it("ignores a block with no effort", () => assert.deepEqual(learnMinutesPerPoint({ minutesPerPoint: 40, samples: 1 }, 60, null), { minutesPerPoint: 40, samples: 1 }));
});

describe("isMandatory", () => {
  it("Urgent is mandatory", () => assert.equal(isMandatory({ priority: 1, dueDate: null }, MON), true));
  it("Haute due within 48 h is mandatory", () => assert.equal(isMandatory({ priority: 2, dueDate: TUE }, MON), true));
  it("Haute due later is not", () => assert.equal(isMandatory({ priority: 2, dueDate: "2026-11-09" }, MON), false));
  it("a graded deliverable is", () => assert.equal(isMandatory({ priority: 4, dueDate: null, graded: true }, MON), true));
  it("Moyenne is not", () => assert.equal(isMandatory({ priority: 3, dueDate: MON }, MON), false));
});

const item = (id: string, from: [string, string], o: Partial<PlanItem> = {}): PlanItem => ({
  blockId: id, title: id, minutes: 60, priority: 3, dueDate: null, mandatory: false, habit: false,
  from: { start: at(MON, from[0]), end: at(MON, from[1]) }, ...o,
});

describe("replanDay", () => {
  const now = at(MON, "13:00");
  const rest = (events: BusyEvent[] = []) => freeSlots(events, [MON]).map((s) => ({ ...s, start: Math.max(s.start, now) }));
  const tomorrow = freeSlots([], [TUE]);

  it("keeps a block that still fits", () => {
    const r = replanDay([item("a", ["15:00", "16:00"])], rest(), tomorrow, { now });
    assert.equal(r.kept.length, 1);
    assert.equal(r.moved.length, 0);
  });
  it("moves a missed block into the rest of the day", () => {
    const r = replanDay([item("a", ["10:00", "11:00"])], rest(), tomorrow, { now });
    assert.equal(r.moved.length, 1);
    assert.equal(r.moved[0].day, "same");
    assert.ok(r.moved[0].to.start >= now);
  });
  it("places mandatory work before the rest", () => {
    const tight = rest([ev("x", MON, "14:00", "22:00", "busy")]); // only 13:00-14:00 left
    const r = replanDay(
      [item("easy", ["13:00", "14:00"], { priority: 3 }), item("must", ["10:00", "11:00"], { priority: 1, mandatory: true })],
      tight, tomorrow, { now },
    );
    assert.equal(r.moved.find((m) => m.blockId === "must")?.day, "same");
    assert.equal(r.moved.find((m) => m.blockId === "easy")?.day, "later");
  });
  it("keeps habits ahead of ordinary work", () => {
    const tight = rest([ev("x", MON, "14:00", "22:00", "busy")]);
    const r = replanDay([item("work", ["10:00", "11:00"], { priority: 2 }), item("habit", ["10:00", "11:00"], { priority: 4, habit: true })], tight, tomorrow, { now });
    assert.equal(r.moved.find((m) => m.blockId === "habit")?.day, "same");
  });
  it("reports overload instead of dropping silently", () => {
    const none = rest([ev("x", MON, "13:00", "22:00", "busy")]);
    const r = replanDay([item("must", ["10:00", "11:00"], { priority: 1, mandatory: true, dueDate: MON })], none, [], { now });
    assert.equal(r.unplaceable.length, 1);
    assert.equal(r.unplaceable[0].mandatory, true);
    assert.equal(r.dropped.length, 0);
  });
  it("drops ordinary work that fits nowhere, with a reason", () => {
    const none = rest([ev("x", MON, "13:00", "22:00", "busy")]);
    const r = replanDay([item("a", ["10:00", "11:00"])], none, [], { now });
    assert.equal(r.dropped.length, 1);
    assert.ok(r.dropped[0].reason.length > 0);
  });
  it("accounts for every item exactly once", () => {
    const items = [item("a", ["09:00", "10:00"]), item("b", ["10:00", "11:00"]), item("c", ["15:00", "16:00"])];
    const r = replanDay(items, rest(), tomorrow, { now });
    assert.equal(r.kept.length + r.moved.length + r.dropped.length + r.unplaceable.length, 3);
  });
  it("never overlaps two placements", () => {
    const items = [item("a", ["09:00", "10:00"]), item("b", ["10:00", "11:00"]), item("c", ["11:00", "12:00"])];
    const r = replanDay(items, rest(), tomorrow, { now });
    const spans = [...r.moved.filter((m) => m.day === "same").map((m) => m.to), ...r.kept.map((k) => k.at)].sort((x, y) => x.start - y.start);
    for (let i = 1; i < spans.length; i++) assert.ok(spans[i].start >= spans[i - 1].end);
  });
});

describe("blocks and tasks", () => {
  const end = at(MON, "11:00");
  const grace = DEFAULT_SETTINGS.graceMin;
  it("stays planned before its end", () => assert.equal(reconcileBlockStatus({ status: "planned", end, taskId: "t" }, "open", end - MIN, grace), "planned"));
  it("stays planned during the grace period", () => assert.equal(reconcileBlockStatus({ status: "planned", end, taskId: "t" }, "open", end + 5 * MIN, grace), "planned"));
  it("is missed after the grace period with the task open", () => assert.equal(reconcileBlockStatus({ status: "planned", end, taskId: "t" }, "open", end + 11 * MIN, grace), "missed"));
  it("is done when its task is closed in the source", () => assert.equal(reconcileBlockStatus({ status: "missed", end, taskId: "t" }, "closed", end + 60 * MIN, grace), "done"));
  it("an unlinked block ends done without a question", () => assert.equal(reconcileBlockStatus({ status: "planned", end, taskId: null }, null, end + 60 * MIN, grace), "done"));
  it("a replanned block stays replanned", () => assert.equal(reconcileBlockStatus({ status: "replanned", end, taskId: "t" }, "open", end + 60 * MIN, grace), "replanned"));
  it("links by marker", () => assert.equal(linkedTaskId("notes\ncockpit:task=abc:1", "Titre", new Map()), "abc:1"));
  it("links by ticket identifier", () => assert.equal(linkedTaskId(null, "COV-14 géoloc", new Map([["COV-14", "linear:1"]])), "linear:1"));
  it("does not link an unknown ticket", () => assert.equal(linkedTaskId(null, "COV-99", new Map()), null));
  it("writes a marker once", () => assert.equal(withMarker("cockpit:task=old", "new"), "cockpit:task=new"));
});

describe("calendar write guard", () => {
  it("allows travail and perso", () => {
    assert.equal(canWriteCalendar("travail"), true);
    assert.equal(canWriteCalendar("perso"), true);
  });
  it("refuses socle, cours, engagement and unknown roles", () => {
    for (const r of ["socle", "cours", "engagement", undefined]) {
      assert.equal(canWriteCalendar(r), false);
      assert.throws(() => assertWritableCalendar(r));
    }
  });
  it("maps roles to busy kinds", () => {
    assert.equal(kindOfRole("socle"), "protected");
    assert.equal(kindOfRole("cours"), "protected");
    assert.equal(kindOfRole("engagement"), "avoided");
    assert.equal(kindOfRole("travail"), "busy");
  });
});
