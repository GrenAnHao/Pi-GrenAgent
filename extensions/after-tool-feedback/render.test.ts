import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../diagnostics/parsers.js";
import { patchContent, renderDiagnostics } from "./render.js";

const diags: Diagnostic[] = [
  { file: "a.ts", line: 3, col: 5, severity: "error", message: "Type 'x' is not assignable", source: "tsc" },
];

describe("renderDiagnostics", () => {
  it("renders one line per diagnostic", () => {
    expect(renderDiagnostics(diags, 50)).toBe("ERROR a.ts:3:5 [tsc] Type 'x' is not assignable");
  });

  it("truncates and notes the remainder", () => {
    const many: Diagnostic[] = Array.from({ length: 5 }, (_, i) => ({ ...diags[0], line: i }));
    expect(renderDiagnostics(many, 2)).toContain("还有 3 条");
  });

  it("omits col when absent", () => {
    expect(renderDiagnostics([{ file: "b.ts", line: 1, severity: "warning", message: "m", source: "eslint" }], 5)).toBe(
      "WARNING b.ts:1 [eslint] m",
    );
  });
});

describe("patchContent", () => {
  it("appends a diagnostics block after original content", () => {
    expect(patchContent([{ type: "text", text: "edited a.ts" }], "ERROR a.ts:3 ...")).toEqual([
      { type: "text", text: "edited a.ts" },
      { type: "text", text: "\n[写后诊断]\nERROR a.ts:3 ..." },
    ]);
  });
});
