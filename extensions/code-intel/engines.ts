// 代码图谱引擎注册表。纯元数据 + 纯函数，无 I/O，便于测试与互换。
import type { McpServerConfig } from "../mcp/config.js";

export interface CodeIntelEngine {
  /** 注入用的规范 MCP server 名（也是让位判定的同名键）。 */
  serverName: string;
  /** 该引擎暴露的工具前缀，用于「签名识别」用户自配同类引擎。无统一前缀时留空。 */
  toolPrefix: string;
  /** 无前缀时的签名工具集：用户某 server 同时暴露这些工具即视为命中该引擎。 */
  signatureTools?: string[];
  /** 由捆绑目录与平台构建 stdio McpServerConfig。 */
  buildConfig: (pkgDir: string, platform: string) => McpServerConfig;
}

// codebase-memory-mcp 是「单文件静态二进制」（非目录 bundle），由 build-codebasememory.mjs
// 放在 PI_PACKAGE_DIR/codebase-memory/codebase-memory-mcp(.exe)。无参启动即 MCP/stdio 服务器
// （JSON-RPC 2.0）。它是多项目的：不吃 codegraph 的 `--path`，查询按 `project=<slug>` 定位
// （slug 在 explorer.ts 按 cwd 确定性算出注入）。索引落在 CBM_CACHE_DIR（默认
// ~/.cache/codebase-memory-mcp）——该 env 经 process.env 继承给 MCP server，无需在此显式注入。
function cbmBinDir(pkgDir: string): string {
  return `${pkgDir.replace(/[\\/]+$/, "")}/codebase-memory`;
}

const ENGINES: Record<string, CodeIntelEngine> = {
  "codebase-memory": {
    serverName: "codebase-memory",
    // 无统一前缀（工具名是 search_graph/trace_path/query_graph/... ）→ 走签名工具集识别。
    toolPrefix: "",
    signatureTools: ["search_graph", "trace_path"],
    buildConfig: (pkgDir, platform) => {
      const dir = cbmBinDir(pkgDir);
      const exe = platform === "win32" ? "codebase-memory-mcp.exe" : "codebase-memory-mcp";
      return {
        name: "codebase-memory",
        transport: "stdio",
        command: `${dir}/${exe}`,
        args: [],
        // cwd=workspace：对齐 cbm 的 session 检测（仅 auto-index 用，默认关），无 codegraph 那种
        // 含空格路径在 spawn worker 时被截断的问题，故单二进制无需相对入口规避。
        cwd: "${workspaceFolder}",
        // CBM_CACHE_DIR 经 process.env 继承（dev 默认 ~/.cache/codebase-memory-mcp；
        // 打包后由 Rust 侧设为 app 可写数据目录）。
        env: {},
      };
    },
  },
};

export function getEngine(name: string): CodeIntelEngine | undefined {
  return ENGINES[name];
}

export function listEngineNames(): string[] {
  return Object.keys(ENGINES);
}

/** 用户自配的某 server 暴露的工具是否命中某引擎签名（即便其 server 名不同）。 */
export function matchesEngineSignature(engineName: string, toolNames: string[]): boolean {
  const eng = ENGINES[engineName];
  if (!eng) return false;
  if (eng.toolPrefix) return toolNames.some((t) => t.startsWith(eng.toolPrefix));
  if (eng.signatureTools?.length) return eng.signatureTools.every((s) => toolNames.includes(s));
  return false;
}
