import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { biggestComeback, computeAwards, form, isCrisis, longestWinRun, overallRating, pillarRating, pillarWeight, resultOf, scoreDay, table, type DayItem, type Played, type MatchResult } from "./season";

const block = (done: boolean, effort = 2, mandatory = false): DayItem => ({ kind: "block", effort, done, mandatory });
const ritual = (done: boolean): DayItem => ({ kind: "ritual", effort: 0, done, mandatory: false });

describe("result thresholds", () => {
  it("wins at 80 %, draws from 60 %, loses below", () => {
    assert.deepEqual([0.8, 0.95, 1].map((r) => resultOf(r)), ["V", "V", "V"]);
    assert.deepEqual([0.6, 0.79, 0.7999].map((r) => resultOf(r)), ["N", "N", "N"]);
    assert.deepEqual([0, 0.5, 0.5999].map((r) => resultOf(r)), ["D", "D", "D"]);
  });
  it("reads the thresholds from the settings", () => {
    const s = { winAt: 0.9, drawAt: 0.5 };
    assert.deepEqual([0.85, 0.5, 0.49].map((r) => resultOf(r, s)), ["N", "N", "D"]);
  });
});

describe("scoring a day", () => {
  it("is not a match when nothing was planned", () => assert.equal(scoreDay([], null), null));
  it("weighs a block by its effort plus one, a ritual by one", () => {
    const s = scoreDay([block(true, 3), block(false, 1), ritual(true), ritual(true)], null)!;
    assert.equal(s.plannedPoints, 4 + 2 + 1 + 1);
    assert.equal(s.donePoints, 4 + 1 + 1);
    assert.equal(s.ratio, 0.75);
    assert.equal(s.result, "N");
    assert.equal(s.points, 1);
  });
  it("wins with everything done", () => {
    const s = scoreDay([block(true), ritual(true), ritual(true)], null)!;
    assert.deepEqual([s.ratio, s.result, s.points], [1, "V", 3]);
  });
  it("loses when most of the plan is missed", () => {
    const s = scoreDay([block(false, 5), block(true, 1), ritual(false), ritual(true)], null)!;
    assert.equal(s.result, "D");
    assert.equal(s.points, 0);
  });
  it("counts goals for and against", () => {
    const s = scoreDay([block(true, 3), block(true, 2), block(false, 5, true), block(false, 1, true), ritual(true)], null)!;
    assert.equal(s.goalsFor, 3 + 2 + 2 + 1); // effort done + blocks kept + rituals done
    assert.equal(s.goalsAgainst, 2);
    assert.equal(s.mandatoryMissed, 2);
  });
  it("derives the result from the ratio, not from the goals", () => {
    const s = scoreDay([block(true, 1), block(false, 8, true)], null)!;
    assert.equal(s.result, "D");
    assert.ok(s.goalsFor >= 1);
  });
  it("doubles the goals of a cup match and flags it, leaving the result alone", () => {
    const items = [block(true, 3), block(false, 2, true), ritual(true)];
    const normal = scoreDay(items, null)!;
    const cup = scoreDay(items, { title: "EV Réseaux" })!;
    assert.equal(cup.goalsFor, normal.goalsFor * 2);
    assert.equal(cup.goalsAgainst, normal.goalsAgainst * 2);
    assert.deepEqual([cup.cup, cup.cupTitle, cup.result, cup.points], [true, "EV Réseaux", normal.result, normal.points]);
    assert.deepEqual([normal.cup, normal.cupTitle], [false, null]);
  });
  it("counts the blocks and rituals", () => {
    const s = scoreDay([block(true), block(false), ritual(true), ritual(false)], null)!;
    assert.deepEqual([s.blocksPlanned, s.blocksKept, s.ritualsPlanned, s.ritualsDone], [2, 1, 2, 1]);
  });
});

const m = (day: number, result: MatchResult, o: Partial<Played> = {}): Played => ({ day: `2026-10-${String(day).padStart(2, "0")}`, result, goalsFor: 4, goalsAgainst: 1, ...o });
const run = (...r: MatchResult[]) => r.map((x, i) => m(i + 1, x));

describe("form and crise", () => {
  it("is the last five results, oldest first", () => assert.deepEqual(form(run("V", "V", "N", "D", "V", "V", "D")), ["N", "D", "V", "V", "D"]));
  it("orders by day, not by input order", () => assert.deepEqual(form([m(3, "D"), m(1, "V"), m(2, "N")]), ["V", "N", "D"]));
  it("crise = two losses in a row, at the end", () => {
    assert.ok(isCrisis(run("V", "D", "D")));
    assert.ok(!isCrisis(run("V", "D", "N")));
    assert.ok(!isCrisis(run("D", "D", "V")));
    assert.ok(!isCrisis(run("D")));
    assert.ok(!isCrisis([]));
  });
});

describe("the table", () => {
  it("adds points, results and goals", () => {
    const t = table(run("V", "V", "N", "D"));
    assert.deepEqual([t.played, t.points, t.wins, t.draws, t.losses, t.goalsFor, t.goalsAgainst, t.perMatch], [4, 7, 2, 1, 1, 16, 4, 1.75]);
  });
  it("is empty without matches", () => assert.deepEqual(table([]), { played: 0, points: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, perMatch: 0 }));
});

describe("the player card", () => {
  const base = { effortDone: 6, effortPlanned: 10, blocksKept: 6, blocksPlanned: 10, habitRatios: [0.8], goalPcts: [40] };
  it("stays between 0 and 99", () => {
    assert.equal(pillarRating({ effortDone: 99, effortPlanned: 1, blocksKept: 9, blocksPlanned: 1, habitRatios: [3], goalPcts: [500] }), 99);
    assert.equal(pillarRating({ effortDone: 0, effortPlanned: 10, blocksKept: 0, blocksPlanned: 10, habitRatios: [0], goalPcts: [0] }), 0);
    assert.equal(pillarRating({ effortDone: -5, effortPlanned: 10, blocksKept: 0, blocksPlanned: 3, habitRatios: [-1], goalPcts: [-20] }), 0);
  });
  it("is null when the pillar has no data", () => assert.equal(pillarRating({ effortDone: 0, effortPlanned: 0, blocksKept: 0, blocksPlanned: 0, habitRatios: [], goalPcts: [] }), null));
  it("rises with each component, never falling", () => {
    const r0 = pillarRating(base)!;
    for (const better of [{ effortDone: 8 }, { blocksKept: 9 }, { habitRatios: [1] }, { goalPcts: [70] }]) assert.ok(pillarRating({ ...base, ...better })! > r0, JSON.stringify(better));
    for (const worse of [{ effortDone: 2 }, { blocksKept: 1 }, { habitRatios: [0.2] }, { goalPcts: [5] }]) assert.ok(pillarRating({ ...base, ...worse })! < r0, JSON.stringify(worse));
  });
  it("uses whichever components exist", () => assert.equal(pillarRating({ effortDone: 0, effortPlanned: 0, blocksKept: 0, blocksPlanned: 0, habitRatios: [], goalPcts: [50] }), 50));
  it("weights the overall rating by pillar priority and skips pillars without a rating", () => {
    assert.equal(overallRating([{ rating: 80, weight: 3 }, { rating: 40, weight: 1 }, { rating: null, weight: 4 }]), 70);
    assert.equal(overallRating([{ rating: null, weight: 1 }]), null);
    assert.equal(overallRating([]), null);
  });
  it("weighs a pillar by its best project priority", () => {
    assert.equal(pillarWeight([3, 2, null]), 3);
    assert.equal(pillarWeight([1]), 4);
    assert.equal(pillarWeight([]), 1);
    assert.equal(pillarWeight([4, null]), 1);
  });
});

describe("awards", () => {
  it("finds the longest run of wins", () => assert.deepEqual(longestWinRun(run("V", "V", "D", "V", "V", "V", "N")), { length: 3, end: "2026-10-06" }));
  it("has no run without a win", () => assert.equal(longestWinRun(run("D", "N")), null));
  it("finds the biggest comeback after a crise", () => {
    assert.deepEqual(biggestComeback(run("V", "D", "D", "N", "V", "V", "D", "D", "D", "V")), { run: 3, crisis: 2, end: "2026-10-06" });
  });
  it("needs two losses in a row to count as a crise", () => assert.equal(biggestComeback(run("V", "D", "V", "V", "D", "N")), null));
  it("ignores a crise with no recovery after it", () => assert.equal(biggestComeback(run("V", "D", "D")), null));
  it("writes the recap", () => {
    const awards = computeAwards({
      matches: run("V", "V", "D", "D", "N", "V"),
      pillarRatings: [{ name: "Sport", rating: 71 }, { name: "Études", rating: 64 }, { name: "Vie", rating: null }],
      projectPoints: [{ name: "Mémoire", points: 21 }, { name: "Marathon", points: 30 }],
    });
    assert.deepEqual(awards.map((a) => [a.kind, a.subject]), [["meilleur-pilier", "Sport"], ["meilleur-projet", "Marathon"], ["serie-victoires", "2 victoires de suite"], ["remontada", "2 matchs sans défaite après 2 défaites"]]);
  });
  it("skips awards there is no data for", () => assert.deepEqual(computeAwards({ matches: [], pillarRatings: [], projectPoints: [] }), []));
});
