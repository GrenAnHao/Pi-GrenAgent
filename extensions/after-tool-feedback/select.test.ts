import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../diagnostics/parsers.js";
import { diffNewDiagnostics, extractEditedPaths } from "./select.js";

describe("extractEditedPaths", () => {
  it("reads path from edit/write input", () => {
    expect(extractEditedPaths({ toolName: "edit", input: { path: "src/a.ts" } })).toEqual(["src/a.ts"]);
    expect(extractEditedPaths({ toolName: "write", input: { path: "b.ts" } })).toEqual(["b.ts"]);
  });

  it("returns [] for non-edit tools", () => {
    expect(extractEditedPaths({ toolName: "read", input: { path: "x" } })).toEqual([]);
  });

  it("returns [] when path missing", () => {
    expect(extractEditedPaths({ toolName: "edit", input: {} })).toEqual([]);
  });
});

describe("diffNewDiagnostics", () => {
  it("keeps only diagnostics not present before", () => {
    const prev: Diagnostic[] = [{ file: "a", line: 1, severity: "error", message: "m1", source: "tsc" }];
    const curr: Diagnostic[] = [
      { file: "a", line: 1, severity: "error", message: "m1", source: "tsc" },
      { file: "a", line: 2, severity: "error", message: "m2", source: "tsc" },
    ];
    expect(diffNewDiagnostics(prev, curr).map((d) => d.message)).toEqual(["m2"]);
  });

  it("returns all when prev empty", () => {
    const curr: Diagnostic[] = [{ file: "a", line: 1, severity: "error", message: "m", source: "tsc" }];
    expect(diffNewDiagnostics([], curr)).toEqual(curr);
  });
});
