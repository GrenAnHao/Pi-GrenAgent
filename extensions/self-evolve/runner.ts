// dream/distill 子代理：registry 登记 + spawnPiAgent JSON 流（右坞/ Bot 菜单可见）。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getConfig } from "../_shared/runtime-config.js";
import { spawnPiAgent } from "../multi-agent/runner.js";
import { SubAgentRegistry } from "../multi-agent/registry.js";
import { DISTILL_PERSONA, DISTILL_TASK, DREAM_PERSONA, DREAM_TASK } from "./personas.js";

const NETWORK_DENY = [
  "web_search",
  "web_search_multi",
  "fetch_url",
  "fetch_llms",
  "fetch_html",
  "fetch_markdown",
  "fetch_txt",
  "fetch_json",
  "fetch_github_readme",
  "fetch_web_content",
  "image_gen",
];

const TASK_LABEL: Record<"dream" | "distill", Record<"manual" | "auto", string>> = {
  dream: { manual: "Dream（手动）", auto: "Auto Dream" },
  distill: { manual: "Distill（手动）", auto: "Auto Distill" },
};

function registryFor(cwd: string): SubAgentRegistry {
  return new SubAgentRegistry(join(cwd, ".pi", "subagents", "registry.db"));
}

function loadPersona(agent: "dream" | "distill"): string {
  const fallback = agent === "dream" ? DREAM_PERSONA : DISTILL_PERSONA;
  try {
    return readFileSync(join(getAgentDir(), "agents", `${agent}.md`), "utf8").trim() || fallback;
  } catch {
    return fallback;
  }
}

function taskText(agent: "dream" | "distill"): string {
  return agent === "dream" ? DREAM_TASK : DISTILL_TASK;
}

function resolveModel(explicit?: string): string | undefined {
  const fromOpt = explicit?.trim();
  if (fromOpt) return fromOpt;
  const fromCfg = getConfig("SELF_EVOLVE_MODEL")?.trim();
  if (fromCfg) return fromCfg;
  return getConfig("SUBAGENT_MODEL")?.trim() || undefined;
}

function evolveEnv(model?: string): Record<string, string> {
  return {
    ...process.env,
    SELF_EVOLVE_CHILD: "1",
    ...(model ? { SUBAGENT_MODEL: model } : {}),
    SAFETY_DENY_TOOLS: [process.env.SAFETY_DENY_TOOLS, ...NETWORK_DENY].filter(Boolean).join(","),
  };
}

export interface EvolveJobOpts {
  agent: "dream" | "distill";
  cwd: string;
  source: "manual" | "auto";
  model?: string;
  timeoutMs: number;
}

export interface EvolveJobResult {
  id: string;
  ok: boolean;
  output: string;
  error?: string;
  exitCode: number;
}

const inflight = new Map<string, Promise<EvolveJobResult>>();

export function startEvolveJob(
  opts: EvolveJobOpts,
  hooks?: { onComplete?: (r: EvolveJobResult) => void },
): { id: string } {
  const registry = registryFor(opts.cwd);
  const id = SubAgentRegistry.genId();
  const chosenModel = resolveModel(opts.model);
  registry.create({
    id,
    task: TASK_LABEL[opts.agent][opts.source],
    profile: JSON.stringify({ preset: opts.agent, source: opts.source }),
    model: chosenModel ?? null,
  });

  const p = spawnPiAgent(opts.cwd, taskText(opts.agent), {
    model: chosenModel,
    systemPrompt: loadPersona(opts.agent),
    timeoutMs: opts.timeoutMs,
    env: evolveEnv(chosenModel),
    onUpdate: () => registry.touch(id),
  })
    .then((r) => {
      registry.finish(id, {
        status: r.ok ? "done" : "error",
        output: r.output,
        error: r.error ?? null,
        exitCode: r.exitCode,
      });
      const result: EvolveJobResult = {
        id,
        ok: r.ok,
        output: r.output,
        error: r.error,
        exitCode: r.exitCode,
      };
      hooks?.onComplete?.(result);
      return result;
    })
    .catch((e) => {
      const msg = String((e as Error)?.message ?? e);
      registry.finish(id, { status: "error", error: msg, exitCode: -1 });
      const result: EvolveJobResult = { id, ok: false, output: "", error: msg, exitCode: -1 };
      hooks?.onComplete?.(result);
      return result;
    })
    .finally(() => {
      registry.close();
      inflight.delete(id);
    });

  inflight.set(id, p);
  return { id };
}

/** 测试与需要同步等待时使用 */
export function waitEvolveJob(id: string, cwd: string): Promise<EvolveJobResult> {
  const pending = inflight.get(id);
  if (pending) return pending;
  const registry = registryFor(cwd);
  const row = registry.get(id);
  registry.close();
  return Promise.resolve({
    id,
    ok: row?.status === "done",
    output: row?.output ?? "",
    error: row?.error ?? undefined,
    exitCode: row?.exitCode ?? -1,
  });
}

/** @deprecated 使用 startEvolveJob */
export function spawnEvolveAgent(opts: {
  agent: "dream" | "distill";
  cwd: string;
  model?: string;
  timeoutMs: number;
}): void {
  startEvolveJob({ ...opts, source: "manual" });
}
