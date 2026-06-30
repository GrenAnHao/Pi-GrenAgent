import { describe, expect, it } from "vitest";
import codeExec from "./index.js";

describe("code-exec extension", () => {
  it("registers py and js run/reset tools", () => {
    const names: string[] = [];
    const pi = {
      registerTool: (tool: { name: string }) => {
        names.push(tool.name);
      },
      on: () => {},
    };
    codeExec(pi as unknown as Parameters<typeof codeExec>[0]);
    expect(names).toEqual(["py_run", "py_reset", "js_run", "js_reset"]);
  });
});
