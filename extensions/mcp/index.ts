// mcp: connect external MCP servers (stdio / SSE) and expose their tools to the
// agent as `mcp__<server>__<tool>`. Connections live for the sidecar process.
//
// The extension factory is async: pi awaits it, so all servers are connected and
// their tools registered before the agent starts (no runtime dynamic registration).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Type } from "typebox";
import { type McpServerConfig, parseMcpServers, sanitize } from "./config.js";

const MCP_TIMEOUT_MS = Number(process.env.MCP_TIMEOUT_MS ?? "15000") || 15000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

async function connect(s: McpServerConfig): Promise<Client> {
  const client = new Client({ name: "grenagent", version: "0.1.0" });
  const transport =
    s.transport === "sse"
      ? new SSEClientTransport(new URL(s.url ?? ""))
      : new StdioClientTransport({
          command: s.command ?? "",
          args: s.args ?? [],
          env: { ...(process.env as Record<string, string>), ...(s.env ?? {}) },
        });
  try {
    await withTimeout(client.connect(transport), MCP_TIMEOUT_MS);
  } catch (e) {
    // Close on failure so a slow/failed stdio transport doesn't leak its child process.
    await client.close().catch(() => {});
    throw e;
  }
  return client;
}

export default async function (pi: ExtensionAPI) {
  const servers = parseMcpServers(process.env.MCP_SERVERS ?? "");
  if (servers.length === 0) return;

  const clients: Client[] = [];

  for (const s of servers) {
    try {
      const client = await connect(s);
      clients.push(client);
      const { tools } = await withTimeout(client.listTools(), MCP_TIMEOUT_MS);
      for (const t of tools) {
        pi.registerTool({
          name: `mcp__${sanitize(s.name)}__${sanitize(t.name)}`,
          label: `${s.name}: ${t.name}`,
          description: t.description ?? `MCP tool "${t.name}" from server "${s.name}".`,
          parameters: Type.Unsafe(t.inputSchema ?? { type: "object" }),
          async execute(_toolCallId, params) {
            const r = await client.callTool({
              name: t.name,
              arguments: (params ?? {}) as Record<string, unknown>,
            });
            const blocks = Array.isArray(r.content) ? r.content : [];
            const text =
              blocks
                .filter((b): b is { type: "text"; text: string } => !!b && (b as { type?: string }).type === "text")
                .map((b) => b.text)
                .join("\n") || "(no output)";
            return { content: [{ type: "text", text }], details: { server: s.name, tool: t.name } };
          },
        });
      }
      console.error(`[mcp] connected "${s.name}" (${s.transport}); ${tools.length} tools registered`);
    } catch (e) {
      console.error(`[mcp] failed to connect "${s.name}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const cleanup = () => {
    for (const c of clients) void c.close().catch(() => {});
  };
  process.on("exit", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
}
