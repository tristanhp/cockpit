import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computePriority, parsePriorityName, priorityOptionName, projectScaleFromLevel } from "./priority";

const base = { sourceKind: "notion" as const, sourcePriority: null, projectPriority: null, dueDate: null, today: "2026-10-26" };

describe("computePriority", () => {
  it("uses Linear's own priority", () => {
    assert.deepEqual(computePriority({ ...base, sourceKind: "linear", sourcePriority: 3, projectPriority: 2 }), { priority: 3, auto: false });
  });
  it("treats a Linear ticket with no priority as Aucune", () => {
    assert.equal(computePriority({ ...base, sourceKind: "linear" }).priority, 0);
  });
  it("uses the Notion Priorité property when the base has one", () => {
    assert.deepEqual(computePriority({ ...base, sourceHasProperty: true, sourcePriority: 4, projectPriority: 2 }), { priority: 4, auto: false });
  });
  it("reads an empty Priorité cell as Aucune, not as the project's", () => {
    assert.equal(computePriority({ ...base, sourceHasProperty: true, projectPriority: 2 }).priority, 0);
  });
  it("inherits the project's priority when the base has no property", () => {
    assert.deepEqual(computePriority({ ...base, projectPriority: 3 }), { priority: 3, auto: true });
  });
  it("is Aucune without project nor property", () => {
    assert.deepEqual(computePriority(base), { priority: 0, auto: true });
  });
  it("raises an item on a Haute project due within 48 h to Urgent", () => {
    assert.deepEqual(computePriority({ ...base, projectPriority: 2, dueDate: "2026-10-28" }), { priority: 1, auto: true });
  });
  it("does not raise it when the due date is further", () => {
    assert.equal(computePriority({ ...base, projectPriority: 2, dueDate: "2026-10-29" }).priority, 2);
  });
  it("raises an overdue item on a Haute project", () => {
    assert.equal(computePriority({ ...base, projectPriority: 2, dueDate: "2026-10-20" }).priority, 1);
  });
  it("raises a graded deliverable due within 48 h whatever its project", () => {
    assert.equal(computePriority({ ...base, projectPriority: 4, graded: true, dueDate: "2026-10-27" }).priority, 1);
  });
  it("leaves a graded deliverable alone when it is far away", () => {
    assert.equal(computePriority({ ...base, projectPriority: 4, graded: true, dueDate: "2026-11-10" }).priority, 4);
  });
  it("does not raise a Moyenne project's item", () => {
    assert.equal(computePriority({ ...base, projectPriority: 3, dueDate: "2026-10-26" }).priority, 3);
  });
  it("raises a Linear ticket on a Haute project too", () => {
    assert.equal(computePriority({ ...base, sourceKind: "linear", sourcePriority: 3, projectPriority: 2, dueDate: "2026-10-27" }).priority, 1);
  });
  it("keeps an explicit Urgent as not auto", () => {
    assert.deepEqual(computePriority({ ...base, sourceKind: "linear", sourcePriority: 1, projectPriority: 2, dueDate: "2026-10-27" }), { priority: 1, auto: false });
  });
});

describe("computePriority locked", () => {
  it("never raises a priority the user chose", () => {
    assert.deepEqual(computePriority({ ...base, sourcePriority: 4, locked: true, projectPriority: 2, dueDate: "2026-10-26" }), { priority: 4, auto: false });
  });
});

describe("projectScaleFromLevel", () => {
  it("maps the old levels", () => {
    assert.deepEqual(projectScaleFromLevel("P1"), { priority: 2, status: "actif", protected: false });
    assert.equal(projectScaleFromLevel("P2").priority, 3);
    assert.equal(projectScaleFromLevel("Maintenance").priority, 4);
    assert.equal(projectScaleFromLevel("En attente").status, "en-attente");
    assert.deepEqual(projectScaleFromLevel("Socle"), { priority: null, status: "actif", protected: true });
  });
  it("falls back to Aucune", () => {
    assert.equal(projectScaleFromLevel(null).priority, 0);
  });
});

describe("priority names", () => {
  it("parses French and English spellings", () => {
    assert.equal(parsePriorityName("Urgent"), 1);
    assert.equal(parsePriorityName("🔴 Haute"), 2);
    assert.equal(parsePriorityName("moyenne"), 3);
    assert.equal(parsePriorityName("Basse"), 4);
    assert.equal(parsePriorityName("Aucune"), 0);
    assert.equal(parsePriorityName("Autre"), null);
  });
  it("finds the base's own option for a priority", () => {
    assert.equal(priorityOptionName(["Basse", "🔴 Urgent"], 1), "🔴 Urgent");
    assert.equal(priorityOptionName(["Basse"], 2), null);
  });
});
