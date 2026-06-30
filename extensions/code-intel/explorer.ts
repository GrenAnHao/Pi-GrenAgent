// Context-Explorer：只读探索子代理。复用 multi-agent 运行时，把探索 token 关在
// 子代理窗口里，只回紧凑 path:start-end 引用（FastContext 的探索/解题分离）。
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getConfig } from "../_shared/runtime-config.js";
import type { CapabilityProfile } from "../multi-agent/capability.js";
import { profileToEnv, profileToModel } from "../multi-agent/capability.js";
import { spawnPiAgent } from "../multi-agent/runner.js";
import { getEngine } from "./engines.js";

// 改编自 FastContext system.md：只读、并行工具、优先预建索引（codebase-memory），
// 再用 Glob/Grep/Read 补缺，最后只输出 <final_answer> 引用块。
export const EXPLORE_SYSTEM_PROMPT = `You are a read-only code exploration sub-agent.

Your job: answer the caller's question about THIS repository by locating the
relevant code, then return a COMPACT set of references — not full file dumps.

Rules:
- READ-ONLY. Never edit, write, or run build/mutating commands.
- Prefer the pre-built index first: if codebase-memory tools are available
  (search_graph / query_graph / trace_path / get_code_snippet / get_architecture),
  use them to find symbols, call paths and source in one shot. They are far
  cheaper than scanning files. ALWAYS pass project="<the project name given in the
  task>" to every codebase-memory tool call. If a call returns "project not found
  or not indexed" with an available_projects list, retry using the matching name
  from that list.
- Fall back to Glob / Grep / Read only to fill gaps the index didn't cover.
- Run independent lookups in parallel.
- Stop as soon as you can answer; do not over-explore.

Output: end your turn with exactly one block:

<final_answer>
- path/to/file.ts:120-145 - one short sentence on why this is relevant
- path/to/other.ts:8-30 - ...
</final_answer>

Each line is a path:start-end reference plus a one-sentence note. Keep it tight:
the caller has NOT seen the files you read, and only this block returns to them.`;

/**
 * 纯函数：复刻 codebase-memory 的 `cbm_project_name_from_path`（fqn.c）——
 * 非 [A-Za-z0-9._-] 字符→'-'，collapse 连续 '-'/'.'，去首部 '-'/'.' 与尾部 '-'。
 * 用于把 cwd 算成 cbm 的 project slug 注入查询（cbm 查询强制带 project）。
 */
export function slugFromPath(p: string): string {
  const s = p
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+/, "")
    .replace(/-+$/, "");
  return s || "root";
}

/** cbm 缓存目录：CBM_CACHE_DIR（打包后由 Rust 注入）优先，否则默认 ~/.cache/codebase-memory-mcp。 */
function cbmCacheDir(): string {
  const fromEnv = getConfig("CBM_CACHE_DIR")?.trim();
  return fromEnv || join(homedir(), ".cache", "codebase-memory-mcp");
}

/** 「已索引」探针：cbm 索引落在 <cache>/<slug>.db（不在工作区内），故 stat 该文件。 */
export function isWorkspaceIndexed(engineName: string, cwd: string): boolean {
  if (engineName !== "codebase-memory") return false;
  return existsSync(join(cbmCacheDir(), `${slugFromPath(cwd)}.db`));
}

/**
 * 纯函数：由「当前引擎名 + 是否已索引」推导探索子代理的 capability。
 * 已索引且引擎有效 → 开放该引擎的 MCP（codebase-memory 工具）；否则降级为
 * 纯 Read/Glob/Grep（mcp:false）。始终只读、禁 bash、禁 web、便宜模型档。
 */
export function buildExploreProfile(engineName: string, indexed: boolean): CapabilityProfile {
  const engine = engineName === "off" ? undefined : getEngine(engineName);
  const useEngine = !!engine && indexed;
  return {
    name: "context-explorer",
    fs: "readonly",
    net: false,
    mcp: useEngine ? [engine!.serverName] : false,
    spawn: false,
    isolation: "process",
    model: "cheap",
    tools: { deny: ["bash"] },
  };
}

/** 纯函数：抽取 <final_answer> 块；缺失时回退整段输出（降级，不硬失败）。 */
export function extractFinalAnswer(output: string): string {
  const m = output.match(/<final_answer>([\s\S]*?)<\/final_answer>/i);
  return (m ? m[1] : output).trim();
}

/** 注册 explore_context 工具：在独立只读子代理里探索，回传紧凑引用。 */
export function registerExploreContext(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "explore_context",
    label: "Explore Context",
    description:
      "Delegate a repository question to a read-only exploration sub-agent (separate context window). " +
      "It prefers the built-in codebase-memory index, falls back to Glob/Grep/Read, and " +
      "returns a COMPACT set of path:start-end references instead of full file contents.",
    promptGuidelines: [
      "For where/how/find questions about THIS repo, call explore_context instead of grepping/reading files yourself — it keeps the exploration tokens out of your context window.",
      "Pass a precise natural-language query; the sub-agent returns compact path:start-end references you can then open directly.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Natural-language question about the codebase to explore." }),
      max_turns: Type.Optional(Type.Number({ description: "Soft budget for tool-call rounds (default ~6)." })),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      // 防嵌套：子代理不得再发起探索（双防线，另见 index.ts 跳过注册 + runner deny）。
      if (process.env.PI_IS_SUBAGENT === "1") {
        throw new Error("explore_context 不可在子代理内调用（嵌套探索已被拦截）");
      }
      const engineName = getConfig("CODE_INTEL") ?? "codebase-memory";
      const indexed = isWorkspaceIndexed(engineName, ctx.cwd);
      const profile = buildExploreProfile(engineName, indexed);
      const useEngine = profile.mcp !== false;
      const model = getConfig("CODE_INTEL_EXPLORER_MODEL")?.trim() || profileToModel(profile, getConfig);
      const timeoutMs = Number(getConfig("CODE_INTEL_EXPLORER_TIMEOUT_MS") ?? "") || undefined;
      const budget = typeof params.max_turns === "number" && params.max_turns > 0 ? params.max_turns : undefined;
      // cbm 查询强制带 project：把 cwd 算出的 slug 注入任务，子代理零猜测（漏传时 server 回 available_projects 兜底）。
      const projectHint = useEngine
        ? `\n\nThe codebase-memory index for THIS repo is project="${slugFromPath(ctx.cwd)}". Pass that project to every codebase-memory tool call.`
        : "";
      const budgetHint = budget ? `\n\n(Budget: about ${budget} tool-call rounds — converge quickly.)` : "";
      const task = `${params.query}${projectHint}${budgetHint}`;

      const r = await spawnPiAgent(ctx.cwd, task, {
        model,
        systemPrompt: EXPLORE_SYSTEM_PROMPT,
        env: profileToEnv(profile),
        mcp: profile.mcp,
        timeoutMs,
        signal: signal ?? undefined,
        onUpdate: onUpdate
          ? (u) => onUpdate({ content: [{ type: "text", text: u.text }], details: { streaming: true } })
          : undefined,
      });
      if (!r.ok) {
        return {
          content: [{ type: "text", text: `explore_context failed: ${r.error ?? "unknown error"}` }],
          details: { engine: engineName, indexed, exitCode: r.exitCode },
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: extractFinalAnswer(r.output) || "(no findings)" }],
        details: { engine: engineName, indexed, model: model ?? null },
      };
    },
  });
}
