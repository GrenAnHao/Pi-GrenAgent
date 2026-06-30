// 让位推断（纯函数，无 I/O）：用户是否已自配 codebase-memory —— 同名 server，或别名
// server 暴露其签名工具（search_graph + trace_path 同时存在）。命中则内置引擎「让位」，
// UI 显示对应徽标。与 sidecar 侧 injectDefaultServers / engines.matchesEngineSignature
// 的让位策略对齐（此处是前端只读复刻，用于展示）。
const CBM_SERVER_NAME = 'codebase-memory';
const CBM_SIGNATURE_TOOLS = ['search_graph', 'trace_path'];

// toolNames 可能是裸名（search_graph）或缓存里的全名（mcp__server__search_graph），两者都认。
function hasTool(toolNames: string[], tool: string): boolean {
  return toolNames.some((t) => t === tool || t.endsWith(`__${tool}`));
}

export function userConfiguredCodeIntel(mcpServersJson: string, toolNames: string[]): boolean {
  if (CBM_SIGNATURE_TOOLS.every((t) => hasTool(toolNames, t))) return true;
  let parsed: unknown;
  try {
    parsed = JSON.parse(mcpServersJson);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== 'object') return false;
  const root = parsed as Record<string, unknown>;
  const servers =
    'mcpServers' in root && root.mcpServers && typeof root.mcpServers === 'object'
      ? (root.mcpServers as Record<string, unknown>)
      : root;
  return Object.prototype.hasOwnProperty.call(servers, CBM_SERVER_NAME);
}
