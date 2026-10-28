import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parisInstant } from "@/lib/dates";
import { DEFAULT_NOTIFY, dueNotifications, type NotifyState } from "./notifications";

// 2026-11-02 is a Monday, 2026-11-07 a Saturday.
const at = (day: string, hhmm: string) => parisInstant(day, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));
const empty = (): NotifyState => ({ blocks: [], tasks: [], sent: new Set() });
const kinds = (n: ReturnType<typeof dueNotifications>) => n.map((x) => x.kind);

describe("scheduled notifications", () => {
  it("sends the morning cap at 07:30 on a weekday", () => assert.deepEqual(kinds(dueNotifications(at("2026-11-02", "07:32"), empty())), ["cap"]));
  it("does not send the weekday cap on a Saturday at 07:30", () => assert.deepEqual(kinds(dueNotifications(at("2026-11-07", "07:32"), empty())), []));
  it("sends the weekend cap at 09:30 on a Saturday", () => assert.deepEqual(kinds(dueNotifications(at("2026-11-07", "09:35"), empty())), ["cap"]));
  it("sends the clôture at 22:45", () => assert.deepEqual(kinds(dueNotifications(at("2026-11-02", "22:47"), empty())), ["cloture"]));
  it("sends screens-off at 23:00", () => assert.deepEqual(kinds(dueNotifications(at("2026-11-02", "23:01"), empty())), ["screens-off"]));
  it("opens Aujourd'hui from the cap and the clôture from its own notification", () => {
    assert.equal(dueNotifications(at("2026-11-02", "07:32"), empty())[0].url, "/");
    assert.equal(dueNotifications(at("2026-11-02", "22:47"), empty())[0].url, "/cloture");
  });
  it("reads the times from the settings", () => {
    const custom = { ...DEFAULT_NOTIFY, capWeekday: "06:45", clotureTime: "22:15", screensOffTime: "22:45" };
    assert.deepEqual(kinds(dueNotifications(at("2026-11-02", "06:50"), empty(), custom)), ["cap"]);
    assert.deepEqual(kinds(dueNotifications(at("2026-11-02", "07:32"), empty(), custom)), []);
    assert.deepEqual(kinds(dueNotifications(at("2026-11-02", "22:20"), empty(), custom)), ["cloture"]);
  });
  it("sends the revue on the review day, at the configured time, opening /revue", () => {
    // 2026-11-01 is a Sunday.
    const [n] = dueNotifications(at("2026-11-01", "19:34"), empty());
    assert.equal(n.kind, "revue");
    assert.equal(n.url, "/revue");
    assert.deepEqual(kinds(dueNotifications(at("2026-11-02", "19:34"), empty())), []);
    assert.deepEqual(kinds(dueNotifications(at("2026-11-02", "18:05"), empty(), { ...DEFAULT_NOTIFY, reviewDay: 1, reviewTime: "18:00" })), ["revue"]);
  });
  it("sends nothing at a quiet hour", () => assert.deepEqual(dueNotifications(at("2026-11-02", "15:12"), empty()), []));
  it("catches up a missed cron run within the window", () => assert.deepEqual(kinds(dueNotifications(at("2026-11-02", "22:58"), empty())), ["cloture"]));
  it("does not send a clôture hours late", () => assert.deepEqual(dueNotifications(at("2026-11-02", "21:00"), empty()), []));
  it("never sends the same one twice", () => {
    const now = at("2026-11-02", "22:47");
    const state = empty();
    const first = dueNotifications(now, state);
    first.forEach((n) => state.sent.add(n.key));
    assert.equal(first.length, 1);
    assert.deepEqual(dueNotifications(now + 5 * 60_000, state), []);
  });
  it("sends again the next day", () => {
    const state = empty();
    state.sent.add("cloture:2026-11-02");
    assert.deepEqual(kinds(dueNotifications(at("2026-11-03", "22:46"), state)), ["cloture"]);
  });
});

describe("block-end check-in", () => {
  const state = (taskOpen: boolean): NotifyState => ({ ...empty(), blocks: [{ id: "b1", title: "Mémoire", endMs: at("2026-11-02", "11:00"), taskId: "t", taskOpen }] });
  it("fires after the block ends while its task is open", () => {
    const [n] = dueNotifications(at("2026-11-02", "11:05"), state(true));
    assert.equal(n.kind, "block-end");
    assert.equal(n.url, "/?r=b1");
  });
  it("stays quiet when the task is closed", () => assert.deepEqual(dueNotifications(at("2026-11-02", "11:05"), state(false)), []));
  it("stays quiet before the end", () => assert.deepEqual(dueNotifications(at("2026-11-02", "10:50"), state(true)), []));
  it("stops being relevant an hour later", () => assert.deepEqual(dueNotifications(at("2026-11-02", "12:30"), state(true)), []));
  it("is not repeated once sent", () => {
    const s = state(true);
    s.sent.add("block-end:b1");
    assert.deepEqual(dueNotifications(at("2026-11-02", "11:05"), s), []);
  });
});

describe("deadline at risk", () => {
  const task = (o: Partial<NotifyState["tasks"][number]> = {}) => ({ id: "t1", title: "Rendu", priority: 1, dueDate: "2026-11-03", hasBlockBeforeDue: false, ...o });
  const state = (o?: Partial<NotifyState["tasks"][number]>): NotifyState => ({ ...empty(), tasks: [task(o)] });
  it("warns for an Urgent task with no block before its due date", () => assert.deepEqual(kinds(dueNotifications(at("2026-11-02", "10:00"), state())), ["deadline"]));
  it("warns for a Haute task too", () => assert.deepEqual(kinds(dueNotifications(at("2026-11-02", "10:00"), state({ priority: 2 }))), ["deadline"]));
  it("ignores a Moyenne task", () => assert.deepEqual(dueNotifications(at("2026-11-02", "10:00"), state({ priority: 3 })), []));
  it("ignores a task that already has a block", () => assert.deepEqual(dueNotifications(at("2026-11-02", "10:00"), state({ hasBlockBeforeDue: true })), []));
  it("ignores a task due later than the horizon", () => assert.deepEqual(dueNotifications(at("2026-11-02", "10:00"), state({ dueDate: "2026-11-09" })), []));
  it("stays quiet at night", () => assert.deepEqual(dueNotifications(at("2026-11-02", "21:00"), state()), []));
  it("is sent once a day per task", () => {
    const s = state();
    s.sent.add("deadline:t1:2026-11-02");
    assert.deepEqual(dueNotifications(at("2026-11-02", "14:00"), s), []);
    assert.equal(dueNotifications(at("2026-11-03", "10:00"), s).length, 1);
  });
  it("deep-links to the task", () => assert.equal(dueNotifications(at("2026-11-02", "10:00"), state())[0].url, "/taches?t=t1"));
});
