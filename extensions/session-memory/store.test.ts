import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readState, statePath, writeState } from "./store.js";

describe("store", () => {
  it("write then read round-trips; path uses sessionId", () => {
    const dir = mkdtempSync(join(tmpdir(), "sm-"));
    const p = statePath(dir, "sess123");
    expect(p.endsWith(join(".pi", "session-state", "sess123.md"))).toBe(true);
    writeState(p, "## Intent\n- x");
    expect(readState(p)).toBe("## Intent\n- x");
  });
  it("read missing → undefined", () => {
    const dir = mkdtempSync(join(tmpdir(), "sm-"));
    expect(readState(statePath(dir, "none"))).toBeUndefined();
  });
});
