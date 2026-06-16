// Context-Explorer：只读探索子代理。复用 multi-agent 运行时，把探索 token 关在
// 子代理窗口里，只回紧凑 path:start-end 引用（FastContext 的探索/解题分离）。
import type { CapabilityProfile } from "../multi-agent/capability.js";
import { getEngine } from "./engines.js";

// 改编自 FastContext system.md：只读、并行工具、优先预建索引（codegraph_explore），
// 再用 Glob/Grep/Read 补缺，最后只输出 <final_answer> 引用块。
export const EXPLORE_SYSTEM_PROMPT = `You are a read-only code exploration sub-agent.

Your job: answer the caller's question about THIS repository by locating the
relevant code, then return a COMPACT set of references — not full file dumps.

Rules:
- READ-ONLY. Never edit, write, or run build/mutating commands.
- Prefer the pre-built index first: if codegraph_* tools are available, use
  codegraph_explore / codegraph_search / codegraph_node to find symbols, call
  paths and source in one shot. They are far cheaper than scanning files.
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
 * 纯函数：由「当前引擎名 + 是否已索引」推导探索子代理的 capability。
 * 已索引且引擎有效 → 开放该引擎的 MCP（codegraph_* 工具）；否则降级为
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
