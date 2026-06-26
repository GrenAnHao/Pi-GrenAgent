import { describe, expect, it } from "vitest";
import { buildExclusionSet, type ExclusionOp, filterExcludedByTs } from "./exclusion.js";

describe("buildExclusionSet", () => {
  it("replays add/remove ops in order", () => {
    const ops: ExclusionOp[] = [
      { op: "add", ts: 1 },
      { op: "add", ts: 2 },
      { op: "remove", ts: 1 },
    ];
    expect([...buildExclusionSet(ops)].sort()).toEqual([2]);
  });

  it("is empty for no ops", () => {
    expect(buildExclusionSet([]).size).toBe(0);
  });
});

describe("filterExcludedByTs", () => {
  it("drops messages whose timestamp is excluded", () => {
    const msgs = [
      { timestamp: 1, v: "a" },
      { timestamp: 2, v: "b" },
      { timestamp: 3, v: "c" },
    ];
    expect(filterExcludedByTs(msgs, new Set([2])).map((m) => m.v)).toEqual(["a", "c"]);
  });

  it("keeps messages without a timestamp", () => {
    const msgs = [{ v: "a" }, { timestamp: 2, v: "b" }] as Array<{ timestamp?: number; v: string }>;
    expect(filterExcludedByTs(msgs, new Set([2])).map((m) => m.v)).toEqual(["a"]);
  });

  it("returns the same array (no copy) when nothing excluded", () => {
    const msgs = [{ timestamp: 1 }];
    expect(filterExcludedByTs(msgs, new Set())).toBe(msgs);
  });
});
