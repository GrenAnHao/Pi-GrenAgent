// Shared machinery for the persistent code-exec kernels (Python / JS). Both
// kernels spawn a long-lived runner child, send `exec`/`reset` over stdin, and
// correlate `result` lines back to per-request Promises by id. Timeout / abort
// restarts the process (namespace is lost; the tool layer surfaces that).
//
// Subclasses provide only the interpreter-specific bits: how to spawn the child,
// the request id prefix, the exit error message, and how a single exec request
// is encoded (Python sends a plain exec; JS additionally carries a vm-level
// timeout and pads the kernel-level kill timeout).
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { type ExecResult, LineBuffer, encodeReset, parseMessage } from "./protocol.js";

export interface ExecOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface Pending {
  resolve: (r: ExecResult) => void;
  reject: (e: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  onAbort?: () => void;
  signal?: AbortSignal;
}

export abstract class BaseKernel {
  private child: ChildProcessWithoutNullStreams | undefined;
  private readonly pending = new Map<string, Pending>();
  private readonly outBuf = new LineBuffer();
  private counter = 0;

  /** Per-interpreter request id prefix (keeps ids readable in logs). */
  protected abstract readonly idPrefix: string;
  /** Error rejected to in-flight requests when the child exits unexpectedly. */
  protected abstract readonly exitMessage: string;
  /** Spawn the interpreter child process wired for line-delimited stdio. */
  protected abstract spawnChild(): ChildProcessWithoutNullStreams;
  /**
   * Encode one exec request: the kernel-level kill timeout (after which the
   * process is restarted) and the stdin payload to write.
   */
  protected abstract encodeExecRequest(
    id: string,
    code: string,
    timeoutMs: number,
  ): { killTimeoutMs: number; payload: string };

  private nextId(): string {
    return `${this.idPrefix}${++this.counter}`;
  }

  private ensure(): void {
    if (this.child && !this.child.killed) return;
    const child = this.spawnChild();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    child.on("exit", () => this.onExit());
    child.on("error", () => this.onExit());
    this.child = child;
  }

  private onStdout(chunk: string): void {
    for (const line of this.outBuf.push(chunk)) {
      const msg = parseMessage(line);
      if (!msg || typeof msg.id !== "string" || msg.type !== "result") continue;
      const p = this.pending.get(msg.id);
      if (!p) continue;
      this.clearPending(msg.id, p);
      p.resolve(msg as ExecResult);
    }
  }

  private onExit(): void {
    this.child = undefined;
    const err = new Error(this.exitMessage);
    for (const [id, p] of this.pending) {
      this.clearPending(id, p);
      p.reject(err);
    }
  }

  private clearPending(id: string, p: Pending): void {
    if (p.timer) clearTimeout(p.timer);
    if (p.onAbort && p.signal) p.signal.removeEventListener("abort", p.onAbort);
    this.pending.delete(id);
  }

  async exec(code: string, opts: ExecOptions = {}): Promise<ExecResult> {
    this.ensure();
    const id = this.nextId();
    const { killTimeoutMs, payload } = this.encodeExecRequest(id, code, opts.timeoutMs ?? 30_000);
    return new Promise<ExecResult>((resolve, reject) => {
      const p: Pending = { resolve, reject, signal: opts.signal };
      const fail = (msg: string) => {
        const cur = this.pending.get(id);
        if (cur) this.clearPending(id, cur);
        this.restart();
        reject(new Error(msg));
      };
      p.timer = setTimeout(() => fail(`执行超时（${killTimeoutMs}ms），已重启内核`), killTimeoutMs);
      if (opts.signal) {
        if (opts.signal.aborted) {
          fail("已中断");
          return;
        }
        p.onAbort = () => fail("已中断");
        opts.signal.addEventListener("abort", p.onAbort, { once: true });
      }
      this.pending.set(id, p);
      this.child?.stdin.write(payload);
    });
  }

  async reset(): Promise<void> {
    this.ensure();
    const id = this.nextId();
    await new Promise<ExecResult>((resolve, reject) => {
      const p: Pending = { resolve, reject };
      p.timer = setTimeout(() => {
        const cur = this.pending.get(id);
        if (cur) this.clearPending(id, cur);
        reject(new Error("reset 超时"));
      }, 5000);
      this.pending.set(id, p);
      this.child?.stdin.write(encodeReset(id));
    });
  }

  restart(): void {
    this.dispose();
  }

  dispose(): void {
    const child = this.child;
    this.child = undefined;
    if (!child) return;
    try {
      child.stdin.end();
      if (process.platform === "win32" && child.pid) {
        spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
      } else {
        child.kill("SIGKILL");
      }
    } catch {
      /* already gone */
    }
  }
}
