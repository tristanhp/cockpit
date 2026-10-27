import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveOverride } from "./conflict";

describe("resolveOverride", () => {
  it("keeps the override when the source was last edited before it", () => {
    assert.equal(resolveOverride("2026-10-26T10:00:00Z", "2026-10-25T09:00:00Z"), "keep-override");
  });
  it("lets the source win when it was edited after the override", () => {
    assert.equal(resolveOverride("2026-10-26T10:00:00Z", "2026-10-26T11:00:00Z"), "source-wins");
  });
  it("keeps the override when the source has no edit time", () => {
    assert.equal(resolveOverride("2026-10-26T10:00:00Z", null), "keep-override");
  });
});
