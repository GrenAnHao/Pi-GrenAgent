// 沙箱执行助手：沙箱判据 sandboxOn() 为真时——SANDBOX_ENABLE≠off 且审批策略≠full 且 WSL2 沙箱可用——
// 把 py/js 代码一次性丢进 WSL2 srt 跑；否则返回 null，调用方回退本地常驻内核。
// 注意：沙箱模式下常驻内核语义（跨调用变量保留）退化为一次性执行（YAGNI，本期接受）。
// owner 交互会话默认审批策略 auto（非 full）→ 沙箱可用时即路由进沙箱；选「完全访问」(full) 则关沙箱、
// 回宿主内核。不可信子进程（im-platforms 无主人 / multi-agent sandbox 档）由父进程注入 SANDBOX_ENABLE=on，
// 子代理内沙箱可用即走沙箱。
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sandboxOn } from "../_shared/sandbox-gate.js";
import { getSandbox } from "../_shared/sandbox/index.js";

export interface SandboxRunOutcome {
  ok: boolean;
  text: string;
}

// 返回 null = 不走沙箱（策略 full / SANDBOX_ENABLE=off / 沙箱不可用），调用方回退本地内核。
export async function runCodeInSandbox(
  lang: "py" | "js",
  code: string,
  cwd: string,
  timeoutMs?: number,
): Promise<SandboxRunOutcome | null> {
  if (!(await sandboxOn())) return null;
  const sbx = await getSandbox();
  const dir = join(cwd, ".pi");
  mkdirSync(dir, { recursive: true });
  const name = `sbx-${randomBytes(4).toString("hex")}.${lang === "py" ? "py" : "mjs"}`;
  const file = join(dir, name);
  writeFileSync(file, code, "utf8");
  const runner = lang === "py" ? "python3" : "node";
  try {
    const r = await sbx.exec(`${runner} .pi/${name}`, { cwd, timeoutMs: timeoutMs ?? 30_000 });
    const text = (r.stdout + (r.stderr ? `\n${r.stderr}` : "")).trim() || "(no output)";
    return { ok: r.code === 0, text };
  } finally {
    rmSync(file, { force: true });
  }
}
