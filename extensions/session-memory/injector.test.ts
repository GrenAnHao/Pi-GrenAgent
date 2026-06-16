import { describe, expect, it } from "vitest";
import { buildInjection } from "./injector.js";

describe("buildInjection", () => {
  it("wraps with header and is non-display", () => {
    const m = buildInjection("## Intent\n- x", 4000);
    expect(m.customType).toBe("session-state");
    expect(m.display).toBe(false);
    expect(m.content).toContain("# Session working state");
    expect(m.content).toContain("## Intent");
  });
  it("truncates to budget", () => {
    const m = buildInjection("y".repeat(100), 10);
    expect(m.content.endsWith("y".repeat(10))).toBe(true);
  });
});
