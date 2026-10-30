import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isExpired, parsePayload, rationaleSchema, summarize, type Payload } from "./schema";

const ok = (kind: string, payload: unknown) => {
  const r = parsePayload(kind, payload);
  assert.equal(r.ok, true, JSON.stringify(r));
  return (r as { ok: true; payload: Payload }).payload;
};
const bad = (kind: string, payload: unknown) => {
  const r = parsePayload(kind, payload);
  assert.equal(r.ok, false, `${kind} ${JSON.stringify(payload)} should be refused`);
  return (r as { ok: false; error: string }).error;
};

describe("capture payload", () => {
  it("accepts a text, with an optional kind and destination", () => {
    ok("capture", { text: "Appeler le kiné jeudi" });
    ok("capture", { text: "playlist longues sorties", kind: "idea", destination: "Marathon" });
  });
  it("trims and refuses empty or oversized text", () => {
    assert.equal((ok("capture", { text: "  x  " }) as { data: { text: string } }).data.text, "x");
    bad("capture", { text: "   " });
    bad("capture", { text: "a".repeat(501) });
  });
  it("refuses an unknown kind", () => void bad("capture", { text: "x", kind: "note" }));
});

describe("reschedule payload", () => {
  it("accepts a block and a Paris slot", () => void ok("reschedule", { blockId: "gcal-travail:b4", start: "2026-11-04T09:00" }));
  it("refuses a malformed slot, with a French hint", () => {
    assert.match(bad("reschedule", { blockId: "b", start: "2026-11-04 09:00" }), /AAAA-MM-JJTHH:mm/);
    bad("reschedule", { blockId: "b", start: "2026-11-04" });
    bad("reschedule", { blockId: "", start: "2026-11-04T09:00" });
  });
});

describe("task update payload", () => {
  it("accepts each field with its own value type", () => {
    ok("task_update", { taskId: "t", field: "done", value: true });
    ok("task_update", { taskId: "t", field: "dueDate", value: "2026-11-10" });
    ok("task_update", { taskId: "t", field: "dueDate", value: null });
    ok("task_update", { taskId: "t", field: "priority", value: 2 });
    ok("task_update", { taskId: "t", field: "effort", value: 5 });
    ok("task_update", { taskId: "t", field: "effort", value: null });
  });
  it("refuses a value of the wrong type or range", () => {
    bad("task_update", { taskId: "t", field: "done", value: "yes" });
    bad("task_update", { taskId: "t", field: "dueDate", value: "demain" });
    bad("task_update", { taskId: "t", field: "priority", value: 5 });
    bad("task_update", { taskId: "t", field: "priority", value: 1.5 });
    bad("task_update", { taskId: "t", field: "effort", value: 4 });
  });
  it("refuses a field that cannot be written", () => void bad("task_update", { taskId: "t", field: "title", value: "x" }));
});

describe("goal breakdown payload", () => {
  it("accepts milestones and tasks", () => {
    const p = ok("goal_breakdown", { goalId: "g", milestones: [{ name: "Plan validé", date: "2026-11-15" }], tasks: [{ title: "Rédiger le plan", dueDate: "2026-11-10" }] });
    assert.equal((p as { data: { tasks: unknown[] } }).data.tasks.length, 1);
  });
  it("needs at least one item", () => void bad("goal_breakdown", { goalId: "g" }));
  it("caps the number of items", () => {
    bad("goal_breakdown", { goalId: "g", milestones: Array.from({ length: 9 }, (_, i) => ({ name: `m${i}`, date: "2026-11-15" })) });
    bad("goal_breakdown", { goalId: "g", tasks: Array.from({ length: 13 }, (_, i) => ({ title: `t${i}` })) });
  });
  it("refuses a milestone without a valid date", () => void bad("goal_breakdown", { goalId: "g", milestones: [{ name: "x", date: "bientôt" }] }));
});

describe("unknown kind and rationale", () => {
  it("refuses an unknown kind", () => assert.match(bad("delete_everything", {}), /inconnu/));
  it("needs a short reason", () => {
    assert.equal(rationaleSchema.safeParse("").success, false);
    assert.equal(rationaleSchema.safeParse("ok").success, false);
    assert.equal(rationaleSchema.safeParse("Le bloc chevauche un cours").success, true);
    assert.equal(rationaleSchema.safeParse("x".repeat(501)).success, false);
  });
});

describe("what the card says", () => {
  it("names the exact reschedule", () => {
    const text = summarize(ok("reschedule", { blockId: "b", start: "2026-11-04T09:00" }), { block: { title: "Mémoire", start: "2026-11-03T13:00:00.000Z" } }).title;
    assert.match(text, /^Déplacer le bloc « Mémoire » de .*14:00 à .*09:00$/);
  });
  it("names each task update", () => {
    const t = (p: unknown) => summarize(ok("task_update", p), { task: "Rendre le TP" }).title;
    assert.equal(t({ taskId: "x", field: "done", value: true }), "Marquer « Rendre le TP » comme terminée");
    assert.equal(t({ taskId: "x", field: "done", value: false }), "Rouvrir « Rendre le TP »");
    assert.equal(t({ taskId: "x", field: "priority", value: 2 }), "Passer « Rendre le TP » en priorité Haute");
    assert.equal(t({ taskId: "x", field: "effort", value: 1 }), "Fixer l'effort de « Rendre le TP » à 1 point");
    assert.match(t({ taskId: "x", field: "dueDate", value: "2026-11-10" }), /^Mettre l'échéance de « Rendre le TP » au /);
    assert.equal(t({ taskId: "x", field: "dueDate", value: null }), "Retirer l'échéance de « Rendre le TP »");
  });
  it("lists the capture and the breakdown", () => {
    assert.equal(summarize(ok("capture", { text: "Appeler le kiné" })).title, "Capturer la tâche « Appeler le kiné »");
    assert.equal(summarize(ok("capture", { text: "x", kind: "idea", destination: "Musique" })).lines[0], "Destination suggérée : Musique");
    const s = summarize(ok("goal_breakdown", { goalId: "g", milestones: [{ name: "Plan", date: "2026-11-15" }], tasks: [{ title: "A" }, { title: "B" }] }), { goal: "Soutenir le mémoire" });
    assert.equal(s.title, "Découper « Soutenir le mémoire » : 1 jalon et 2 tâches");
    assert.equal(s.lines.length, 3);
  });
});

describe("expiry", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  it("expires after seven days, not before", () => {
    assert.equal(isExpired("2026-11-03T12:00:01Z", now), false);
    assert.equal(isExpired("2026-11-03T11:59:59Z", now), true);
    assert.equal(isExpired("2026-11-09T12:00:00Z", now), false);
  });
});
