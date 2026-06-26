// 自进化调度的纯逻辑 + 标记文件 IO（无 LLM、无网络，便于单测）。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;
/** 进程内防抖：一次启动可能触发多个 session_start，避免重复 spawn。 */
export const MIN_SPAWN_GAP_MS = 10_000;

export function daysToMs(days: number): number {
  return Math.max(0, Number.isFinite(days) ? days : 0) * DAY_MS;
}

export interface ScheduleInput {
  enabled: boolean;
  intervalMs: number;
  /** 上次运行的 epoch ms（来自标记文件）；undefined = 从未运行。 */
  lastRunMs: number | undefined;
  /** 项目最早会话的 epoch ms（年龄门槛）；undefined = 无会话。 */
  earliestSessionMs: number | undefined;
  now: number;
  lastSpawnMs: number;
}

/** 是否应触发一次自进化（对齐 MiMo shouldAutoRun 语义）。 */
export function shouldRun(i: ScheduleInput): boolean {
  if (!i.enabled) return false;
  if (i.now - i.lastSpawnMs < MIN_SPAWN_GAP_MS) return false;
  if (i.lastRunMs === undefined) {
    // 首次：项目需足够老（有可固化内容）才跑。
    if (i.earliestSessionMs === undefined) return false;
    return i.now - i.earliestSessionMs >= i.intervalMs;
  }
  return i.now - i.lastRunMs >= i.intervalMs;
}

export function readMarker(path: string): number | undefined {
  try {
    const n = Number(readFileSync(path, "utf8").trim());
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

export function writeMarker(path: string, now: number): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, String(now), "utf8");
  } catch {
    /* best-effort */
  }
}
