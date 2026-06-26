import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { encodeExec } from "./protocol.js";
import { BaseKernel } from "./base-kernel.js";

export type { ExecOptions } from "./base-kernel.js";

// 常驻 JS 内核：spawn 当前 node(process.execPath) 跑 runner.mjs，逐条 exec，结果按 id 关联回 Promise。
// 超时/中断会重启进程（命名空间随之丢失，由上层提示）。按 cwd 各持一个实例。
// 公共机制（pending / 超时 / 中断 / dispose）见 base-kernel.ts，复用 protocol.ts。
export class JsKernel extends BaseKernel {
  protected readonly idPrefix = "j";
  protected readonly exitMessage = "JS 内核进程已退出";

  constructor(
    private readonly runnerPath: string,
    private readonly cwd: string,
  ) {
    super();
  }

  protected spawnChild(): ChildProcessWithoutNullStreams {
    return spawn(process.execPath, [this.runnerPath], {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    }) as ChildProcessWithoutNullStreams;
  }

  protected encodeExecRequest(id: string, code: string, timeoutMs: number) {
    // runner 内 vm 级超时先触发（中断该 cell、保留内核状态）；kernel 级超时多 2s 兜底，仅进程真挂死才杀。
    return { killTimeoutMs: timeoutMs + 2000, payload: encodeExec(id, code, timeoutMs) };
  }
}
