import { describe, expect, it } from "vitest";
import { injectDefaultServers, parseMcpServers, sanitize } from "./config.js";

describe("parseMcpServers", () => {
  it("parses stdio servers (command present)", () => {
    expect(parseMcpServers('{"fs":{"command":"npx","args":["-y","x"],"env":{"K":"v"}}}')).toEqual([
      { name: "fs", transport: "stdio", command: "npx", args: ["-y", "x"], env: { K: "v" } },
    ]);
  });
  it("parses sse servers (url present)", () => {
    expect(parseMcpServers('{"api":{"url":"https://m"}}')).toEqual([
      { name: "api", transport: "sse", url: "https://m" },
    ]);
  });
  it("parses the standard mcpServers wrapper format (.cursor/mcp.json style)", () => {
    expect(parseMcpServers('{"mcpServers":{"fs":{"command":"npx","args":["-y","x"]}}}')).toEqual([
      { name: "fs", transport: "stdio", command: "npx", args: ["-y", "x"], env: {} },
    ]);
  });
  it("tolerates empty / invalid / empty-object JSON", () => {
    expect(parseMcpServers("")).toEqual([]);
    expect(parseMcpServers("not json")).toEqual([]);
    expect(parseMcpServers("{}")).toEqual([]);
  });
  it("skips entries without command or url", () => {
    expect(parseMcpServers('{"bad":{"foo":1}}')).toEqual([]);
  });
  it("parses a stdio server's cwd when present", () => {
    expect(parseMcpServers('{"x":{"command":"c","cwd":"/d"}}')).toEqual([
      { name: "x", transport: "stdio", command: "c", args: [], env: {}, cwd: "/d" },
    ]);
  });
});

describe("injectDefaultServers", () => {
  it("does not inject by default (engines are built into web_search)", () => {
    expect(injectDefaultServers([], {}, "win32")).toEqual([]);
  });
  it("appends open-websearch when OPEN_WEBSEARCH=1 (windows uses cmd /c npx)", () => {
    const out = injectDefaultServers([], { OPEN_WEBSEARCH: "1" }, "win32");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      name: "open-websearch",
      transport: "stdio",
      command: "cmd",
      args: ["/c", "npx", "-y", "open-websearch@latest"],
    });
    expect(out[0].env).toMatchObject({ MODE: "stdio", DEFAULT_SEARCH_ENGINE: "bing" });
  });
  it("uses npx directly on non-windows when enabled", () => {
    expect(injectDefaultServers([], { OPEN_WEBSEARCH: "1" }, "linux")[0]).toMatchObject({
      command: "npx",
      args: ["-y", "open-websearch@latest"],
    });
  });
  it("is disabled when OPEN_WEBSEARCH=0", () => {
    expect(injectDefaultServers([], { OPEN_WEBSEARCH: "0" }, "win32")).toEqual([]);
  });
  it("does not duplicate when the user already configured open-websearch", () => {
    const user = [{ name: "open-websearch", transport: "stdio" as const, command: "x" }];
    expect(injectDefaultServers(user, { OPEN_WEBSEARCH: "1" }, "win32")).toEqual(user);
  });
  it("honors the OPEN_WEBSEARCH_ENGINE override", () => {
    expect(injectDefaultServers([], { OPEN_WEBSEARCH: "1", OPEN_WEBSEARCH_ENGINE: "baidu" }, "linux")[0].env).toMatchObject({
      DEFAULT_SEARCH_ENGINE: "baidu",
    });
  });
});

describe("injectDefaultServers · code-intel", () => {
  const base = { PI_PACKAGE_DIR: "/pkg" } as Record<string, string | undefined>;

  it("injects codebase-memory by default (pointing at the single binary)", () => {
    const cg = injectDefaultServers([], { ...base, CODE_INTEL: "codebase-memory" }, "linux").find(
      (s) => s.name === "codebase-memory",
    );
    expect(cg?.command).toBe("/pkg/codebase-memory/codebase-memory-mcp");
    expect(cg?.args).toEqual([]);
    expect(cg?.cwd).toBe("${workspaceFolder}");
  });

  it("points at the .exe on win32 (single binary, no node launcher)", () => {
    const cg = injectDefaultServers([], { ...base, CODE_INTEL: "codebase-memory" }, "win32").find(
      (s) => s.name === "codebase-memory",
    );
    expect(cg?.command).toBe("/pkg/codebase-memory/codebase-memory-mcp.exe");
    expect(cg?.args).toEqual([]);
    expect(cg?.cwd).toBe("${workspaceFolder}");
  });

  it("injects codebase-memory even when CODE_INTEL is unset (default engine)", () => {
    expect(injectDefaultServers([], { ...base }, "linux").find((s) => s.name === "codebase-memory")).toBeTruthy();
  });

  it("does not inject without PI_PACKAGE_DIR (keeps existing tests green)", () => {
    expect(injectDefaultServers([], { CODE_INTEL: "codebase-memory" }, "linux")).toEqual([]);
  });

  it("skips injection when CODE_INTEL=off", () => {
    expect(
      injectDefaultServers([], { ...base, CODE_INTEL: "off" }, "linux").find((s) => s.name === "codebase-memory"),
    ).toBeUndefined();
  });

  it("falls back to codebase-memory for a removed/unknown engine (e.g. legacy codegraph/gitnexus)", () => {
    const cg = injectDefaultServers([], { ...base, CODE_INTEL: "codegraph" }, "linux").find(
      (s) => s.name === "codebase-memory",
    );
    expect(cg?.command).toBe("/pkg/codebase-memory/codebase-memory-mcp");
  });

  it("yields when the user already configured a same-named server", () => {
    const user = parseMcpServers('{"mcpServers":{"codebase-memory":{"command":"my-cbm","args":["x"]}}}');
    const out = injectDefaultServers(user, { ...base, CODE_INTEL: "codebase-memory" }, "linux");
    expect(out.filter((s) => s.name === "codebase-memory")).toHaveLength(1);
    expect(out.find((s) => s.name === "codebase-memory")?.command).toBe("my-cbm");
  });

  it("yields when a differently-named user server exposes the signature tools", () => {
    const user = parseMcpServers('{"mcpServers":{"my-cbm":{"command":"x"}}}');
    const out = injectDefaultServers(user, { ...base, CODE_INTEL: "codebase-memory" }, "linux", {
      "my-cbm": ["search_graph", "trace_path"],
    });
    expect(out.find((s) => s.name === "codebase-memory")).toBeUndefined();
  });

  it("still injects open-websearch alongside codebase-memory", () => {
    const out = injectDefaultServers([], { ...base, OPEN_WEBSEARCH: "1" }, "linux");
    expect(out.find((s) => s.name === "codebase-memory")).toBeTruthy();
    expect(out.find((s) => s.name === "open-websearch")).toBeTruthy();
  });
});

describe("sanitize", () => {
  it("replaces non-alphanumeric chars with underscore", () => {
    expect(sanitize("we!rd name")).toBe("we_rd_name");
    expect(sanitize("ok_1")).toBe("ok_1");
  });
});
