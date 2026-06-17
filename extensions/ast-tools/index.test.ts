import { describe, expect, it } from "vitest";
import astTools from "./index.js";

describe("ast-tools extension", () => {
  it("registers ast_grep and ast_edit tools", () => {
    const names: string[] = [];
    const pi = {
      registerTool: (tool: { name: string }) => {
        names.push(tool.name);
      },
    };
    // 工具注册不应触发 napi（lazy import 在 execute 内），故纯加载安全。
    astTools(pi as unknown as Parameters<typeof astTools>[0]);
    expect(names).toEqual(["ast_grep", "ast_edit"]);
  });
});
