// extensions/self-evolve: 自进化（dream 知识固化 + distill 行为提炼）。
// session_start 间隔自动触发 registry 子代理；/dream /distill 手动触发；
// before_agent_start 注入 项目+全局 MEMORY.md。子进程置 SELF_EVOLVE_CHILD 防递归。
import { join } from "node:path";
import { getAgentDir, SessionManager, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getConfig } from "../_shared/runtime-config.js";
import { formatInjection, readMemoryFile } from "./memory-file.js";
import { startEvolveJob, type EvolveJobResult } from "./runner.js";
import { daysToMs, readMarker, shouldRun, writeMarker } from "./schedule.js";
import { seedPersonas } from "./seed.js";

const auto = () => (getConfig("SELF_EVOLVE_AUTO") ?? "1") !== "0";
const dreamDays = () => Number(getConfig("SELF_EVOLVE_DREAM_INTERVAL_DAYS") ?? "7");
const distillDays = () => Number(getConfig("SELF_EVOLVE_DISTILL_INTERVAL_DAYS") ?? "30");
const memInject = () => (getConfig("SELF_EVOLVE_MEMORY_INJECT") ?? "1") !== "0";
const memMaxChars = () => Number(getConfig("SELF_EVOLVE_MEMORY_MAX_CHARS") ?? "4096") || 4096;
const timeoutMs = () => Number(getConfig("SELF_EVOLVE_TIMEOUT_MS") ?? "300000") || 300000;
const model = () => getConfig("SELF_EVOLVE_MODEL")?.trim() || undefined;
const isChild = () => process.env.SELF_EVOLVE_CHILD === "1";

const projectMemory = (cwd: string) => join(cwd, ".pi", "memory", "MEMORY.md");
const globalMemory = () => join(getAgentDir(), "MEMORY.md");
const dreamMarker = (cwd: string) => join(cwd, ".pi", "memory", ".self-evolve-dream");
const distillMarker = (cwd: string) => join(cwd, ".pi", "memory", ".self-evolve-distill");

function sessionModifiedMs(info: { modified?: Date | string | number }): number | undefined {
  if (info.modified === undefined) return undefined;
  const t = +new Date(info.modified);
  return Number.isFinite(t) ? t : undefined;
}

async function earliestSessionMs(cwd: string): Promise<number | undefined> {
  const infos = await SessionManager.list(cwd).catch(() => []);
  let min: number | undefined;
  for (const i of infos) {
    const t = sessionModifiedMs(i);
    if (t === undefined) continue;
    min = min === undefined ? t : Math.min(min, t);
  }
  return min;
}

function displayLabel(agent: "dream" | "distill", source: "manual" | "auto"): string {
  if (source === "auto") return agent === "dream" ? "Auto Dream" : "Auto Distill";
  return agent === "dream" ? "Dream" : "Distill";
}

function postNotice(pi: ExtensionAPI, customType: string, lines: string[]) {
  pi.sendMessage({ customType, content: lines.join("\n"), display: true }, { triggerTurn: false });
}

function onAutoComplete(pi: ExtensionAPI, agent: "dream" | "distill", r: EvolveJobResult) {
  const label = displayLabel(agent, "auto");
  if (r.ok) {
    const summary = r.output.trim().slice(0, 400) || "（无文本摘要）";
    postNotice(pi, `self-evolve-${agent}-done`, [`- **${label}** 已完成`, `- ${summary}`]);
    return;
  }
  postNotice(pi, `self-evolve-${agent}-error`, [`- **${label}** 失败`, `- ${r.error ?? "unknown error"}`]);
}

function runEvolve(pi: ExtensionAPI, agent: "dream" | "distill", source: "manual" | "auto", ctx: ExtensionContext) {
  const label = displayLabel(agent, source);
  ctx.ui.notify(`${label} 已在后台启动；点右上角 Bot 查看进度。`, "info");
  postNotice(pi, `self-evolve-${agent}-start`, [
    `- **${label}** 已在后台运行`,
    "- 点右上角 Bot 图标查看进度与完整 transcript",
  ]);
  startEvolveJob(
    { agent, cwd: ctx.cwd, source, model: model(), timeoutMs: timeoutMs() },
    source === "auto" ? { onComplete: (r) => onAutoComplete(pi, agent, r) } : undefined,
  );
}

export default function (pi: ExtensionAPI) {
  let lastDreamSpawn = 0;
  let lastDistillSpawn = 0;

  seedPersonas();

  pi.on("session_start", async (_event, ctx) => {
    if (isChild() || !auto()) return;
    try {
      const now = Date.now();
      const earliest = await earliestSessionMs(ctx.cwd);
      if (
        shouldRun({
          enabled: true,
          intervalMs: daysToMs(dreamDays()),
          lastRunMs: readMarker(dreamMarker(ctx.cwd)),
          earliestSessionMs: earliest,
          now,
          lastSpawnMs: lastDreamSpawn,
        })
      ) {
        lastDreamSpawn = now;
        writeMarker(dreamMarker(ctx.cwd), now);
        runEvolve(pi, "dream", "auto", ctx);
      }
      if (
        shouldRun({
          enabled: true,
          intervalMs: daysToMs(distillDays()),
          lastRunMs: readMarker(distillMarker(ctx.cwd)),
          earliestSessionMs: earliest,
          now,
          lastSpawnMs: lastDistillSpawn,
        })
      ) {
        lastDistillSpawn = now;
        writeMarker(distillMarker(ctx.cwd), now);
        runEvolve(pi, "distill", "auto", ctx);
      }
    } catch {
      /* never block session_start */
    }
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    if (!memInject()) return undefined;
    const body = formatInjection(
      readMemoryFile(projectMemory(ctx.cwd)),
      readMemoryFile(globalMemory()),
      memMaxChars(),
    );
    if (!body) return undefined;
    return { message: { customType: "self-evolve-memory", content: body, display: false } };
  });

  pi.registerCommand("dream", {
    description: "立即固化近期会话知识到记忆库与 MEMORY.md（/dream）",
    handler: async (_args, ctx) => {
      writeMarker(dreamMarker(ctx.cwd), Date.now());
      runEvolve(pi, "dream", "manual", ctx);
    },
  });

  pi.registerCommand("distill", {
    description: "立即提炼近期重复工作流为 skill/agent/command（/distill）",
    handler: async (_args, ctx) => {
      writeMarker(distillMarker(ctx.cwd), Date.now());
      runEvolve(pi, "distill", "manual", ctx);
    },
  });
}
