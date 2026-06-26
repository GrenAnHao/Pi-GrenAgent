import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import { encodeExec } from "./protocol.js";
import { BaseKernel } from "./base-kernel.js";

export type { ExecOptions } from "./base-kernel.js";

export interface PythonInfo {
  cmd: string;
  args: string[];
}

// 候选解释器：显式配置优先；否则按平台默认顺序（-u 关闭缓冲，保证结果即时回传）。
export function pythonCandidates(configured?: string): PythonInfo[] {
  if (configured && configured.trim()) {
    const parts = configured.trim().split(/\s+/);
    return [{ cmd: parts[0], args: [...parts.slice(1), "-u"] }];
  }
  if (process.platform === "win32") {
    return [
      { cmd: "py", args: ["-3", "-u"] },
      { cmd: "python", args: ["-u"] },
      { cmd: "python3", args: ["-u"] },
    ];
  }
  return [
    { cmd: "python3", args: ["-u"] },
    { cmd: "python", args: ["-u"] },
  ];
}

// 探测第一个可用解释器（跑 --version，status 0 即可用）。找不到返回 undefined。
export function detectPython(configured?: string): PythonInfo | undefined {
  for (const cand of pythonCandidates(configured)) {
    try {
      const probeArgs = [...cand.args.filter((a) => a !== "-u"), "--version"];
      const r = spawnSync(cand.cmd, probeArgs, { stdio: "ignore", timeout: 5000 });
      if (!r.error && r.status === 0) return cand;
    } catch {
      /* try next */
    }
  }
  return undefined;
}

// 常驻 Python 内核：spawn 一个 runner.py，逐条 exec，结果按 id 关联回 Promise。
// 超时/中断会重启进程（命名空间随之丢失，由上层提示）。按 cwd 各持一个实例。
// 公共机制（pending / 超时 / 中断 / dispose）见 base-kernel.ts。
export class PythonKernel extends BaseKernel {
  protected readonly idPrefix = "e";
  protected readonly exitMessage = "Python 内核进程已退出";

  constructor(
    private readonly python: PythonInfo,
    private readonly runnerPath: string,
    private readonly cwd: string,
  ) {
    super();
  }

  protected spawnChild(): ChildProcessWithoutNullStreams {
    return spawn(this.python.cmd, [...this.python.args, this.runnerPath], {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
    }) as ChildProcessWithoutNullStreams;
  }

  protected encodeExecRequest(id: string, code: string, timeoutMs: number) {
    return { killTimeoutMs: timeoutMs, payload: encodeExec(id, code) };
  }
}
