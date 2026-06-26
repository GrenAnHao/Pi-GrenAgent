import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { formatInjection, readMemoryFile } from "./memory-file.js";

describe("formatInjection", () => {
  it("both empty → empty string", () => {
    expect(formatInjection("", "  ", 4096)).toBe("");
  });
  it("project only → labeled project block", () => {
    expect(formatInjection("rule A", "", 4096)).toBe("# Project memory\n\nrule A");
  });
  it("global only → labeled global block", () => {
    expect(formatInjection("", "habit B", 4096)).toBe("# Global memory\n\nhabit B");
  });
  it("both → project first then global", () => {
    expect(formatInjection("rule A", "habit B", 4096)).toBe(
      "# Project memory\n\nrule A\n\n# Global memory\n\nhabit B",
    );
  });
  it("over budget → keep project (truncated), drop global", () => {
    // 哨兵用不出现在表头 "# Project memory" / "# Global memory" 里的字符。
    const out = formatInjection("9".repeat(50), "Z".repeat(50), 30);
    expect(out.length).toBe(30);
    expect(out.startsWith("# Project memory")).toBe(true);
    expect(out.includes("Z")).toBe(false);
  });
});

describe("readMemoryFile", () => {
  it("missing file → empty string", () => {
    expect(readMemoryFile(join(tmpdir(), "no-such-MEMORY.md"))).toBe("");
  });
});
