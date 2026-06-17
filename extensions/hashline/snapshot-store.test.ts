import { describe, expect, it } from "vitest";
import { SnapshotStore } from "./snapshot-store.js";

describe("SnapshotStore (LRU)", () => {
  it("stores and retrieves", () => {
    const s = new SnapshotStore(2);
    s.set("a", { content: "A", tag: "1" });
    expect(s.get("a")?.content).toBe("A");
  });

  it("evicts least-recently-used beyond max", () => {
    const s = new SnapshotStore(2);
    s.set("a", { content: "A", tag: "1" });
    s.set("b", { content: "B", tag: "2" });
    s.set("c", { content: "C", tag: "3" }); // 超过 2，淘汰最旧的 a
    expect(s.get("a")).toBeUndefined();
    expect(s.get("b")?.content).toBe("B");
    expect(s.get("c")?.content).toBe("C");
    expect(s.size).toBe(2);
  });

  it("get refreshes recency so the touched key survives eviction", () => {
    const s = new SnapshotStore(2);
    s.set("a", { content: "A", tag: "1" });
    s.set("b", { content: "B", tag: "2" });
    s.get("a"); // a 变为最近使用
    s.set("c", { content: "C", tag: "3" }); // 淘汰最旧的 b（而非 a）
    expect(s.get("a")?.content).toBe("A");
    expect(s.get("b")).toBeUndefined();
  });
});
