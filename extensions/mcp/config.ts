// Pure helpers for the mcp extension: parse the MCP_SERVERS JSON config and
// sanitize names for tool registration. No I/O so the logic stays testable.

export interface McpServerConfig {
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function asStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function asStrRecord(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(asRecord(v))) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

// Parse a `{ name: { command/args/env } | { url } }` map. `url` ⇒ SSE, `command` ⇒ stdio.
// Tolerates empty / invalid JSON and entries missing both command and url.
export function parseMcpServers(json: string): McpServerConfig[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const root = asRecord(parsed);
  // Standard format `{ "mcpServers": { name: {...} } }` (like .cursor/mcp.json /
  // Claude Desktop); also accept a bare `{ name: {...} }` map for convenience.
  const source = "mcpServers" in root ? asRecord(root.mcpServers) : root;
  const servers: McpServerConfig[] = [];
  for (const [name, raw] of Object.entries(source)) {
    const cfg = asRecord(raw);
    const url = typeof cfg.url === "string" ? cfg.url : undefined;
    const command = typeof cfg.command === "string" ? cfg.command : undefined;
    if (url) {
      servers.push({ name, transport: "sse", url });
    } else if (command) {
      servers.push({ name, transport: "stdio", command, args: asStrArray(cfg.args), env: asStrRecord(cfg.env) });
    }
  }
  return servers;
}

// 默认内置 open-webSearch（多引擎搜索 bing/baidu/sogou/csdn/掘金 + 文章抓取，零配置）。
// OPEN_WEBSEARCH=0 关闭；用户在 MCP_SERVERS 自定义同名 server 时以用户配置为准。
// Windows 需经 `cmd /c npx`（直接 spawn npx.cmd 在部分环境会失败），其余平台直接用 npx。
export function injectDefaultServers(
  servers: McpServerConfig[],
  env: Record<string, string | undefined>,
  platform: string,
): McpServerConfig[] {
  if ((env.OPEN_WEBSEARCH ?? "0") === "0") return servers;
  if (servers.some((s) => s.name === "open-websearch")) return servers;
  const isWin = platform === "win32";
  return [
    ...servers,
    {
      name: "open-websearch",
      transport: "stdio",
      command: isWin ? "cmd" : "npx",
      args: isWin ? ["/c", "npx", "-y", "open-websearch@latest"] : ["-y", "open-websearch@latest"],
      env: {
        MODE: "stdio",
        DEFAULT_SEARCH_ENGINE: env.OPEN_WEBSEARCH_ENGINE ?? "bing",
        ALLOWED_SEARCH_ENGINES: env.OPEN_WEBSEARCH_ENGINES ?? "bing,baidu,sogou,csdn,juejin",
      },
    },
  ];
}

export function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_");
}
