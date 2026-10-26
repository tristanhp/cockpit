import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, daysFrom, formatDuration, isoWeek, parisDay } from "./dates";
import { fold } from "./text";

describe("dates", () => {
  it("adds days across month and year boundaries", () => {
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  });

  it("counts whole days between two days", () => {
    assert.equal(daysFrom("2026-10-26", "2026-10-28"), 2);
    assert.equal(daysFrom("2026-10-26", "2026-10-25"), -1);
  });

  it("computes ISO weeks", () => {
    assert.equal(isoWeek("2026-10-26"), 44);
    assert.equal(isoWeek("2027-01-01"), 53);
  });

  it("returns bare dates unchanged and converts instants to Paris days", () => {
    assert.equal(parisDay("2026-10-26"), "2026-10-26");
    assert.equal(parisDay("2026-10-26T23:30:00Z"), "2026-10-27");
  });

  it("formats durations", () => {
    assert.equal(formatDuration(45), "45 min");
    assert.equal(formatDuration(90), "1 h 30");
    assert.equal(formatDuration(120), "2 h");
  });
});

describe("fold", () => {
  it("strips accents and lowercases", () => {
    assert.equal(fold("Échéance Été"), "echeance ete");
  });
});
