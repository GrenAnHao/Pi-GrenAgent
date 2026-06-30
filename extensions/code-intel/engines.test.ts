import { describe, expect, it } from "vitest";
import { getEngine, listEngineNames, matchesEngineSignature } from "./engines.js";

describe("code-intel engines", () => {
  it("codebase-memory builds a stdio McpServerConfig pointing at the single binary (unix)", () => {
    const cfg = getEngine("codebase-memory")!.buildConfig("/pkg", "linux");
    expect(cfg.name).toBe("codebase-memory");
    expect(cfg.transport).toBe("stdio");
    expect(cfg.command).toBe("/pkg/codebase-memory/codebase-memory-mcp");
    expect(cfg.args).toEqual([]);
    expect(cfg.cwd).toBe("${workspaceFolder}");
  });

  it("codebase-memory on win32 points at the .exe (no node launcher)", () => {
    const cfg = getEngine("codebase-memory")!.buildConfig("C:/pkg", "win32");
    expect(cfg.command).toBe("C:/pkg/codebase-memory/codebase-memory-mcp.exe");
    expect(cfg.args).toEqual([]);
    expect(cfg.cwd).toBe("${workspaceFolder}");
  });

  it("trims trailing slashes from pkgDir", () => {
    expect(getEngine("codebase-memory")!.buildConfig("/pkg/", "linux").command).toBe(
      "/pkg/codebase-memory/codebase-memory-mcp",
    );
  });

  it("unknown engine returns undefined", () => {
    expect(getEngine("nope")).toBeUndefined();
  });

  it("lists known engine names", () => {
    expect(listEngineNames()).toContain("codebase-memory");
  });

  it("recognizes a user server exposing the codebase-memory signature tools", () => {
    // No unified prefix → signature is the presence of distinctive tool names.
    expect(matchesEngineSignature("codebase-memory", ["search_graph", "trace_path", "query_graph"])).toBe(true);
    // Missing one of the required signature tools → not a match.
    expect(matchesEngineSignature("codebase-memory", ["search_graph"])).toBe(false);
    expect(matchesEngineSignature("codebase-memory", ["read_file"])).toBe(false);
  });

  it("an unknown engine never matches a signature", () => {
    expect(matchesEngineSignature("nope", ["anything"])).toBe(false);
  });
});
