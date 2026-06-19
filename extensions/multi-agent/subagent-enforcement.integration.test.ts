import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 实测（live）：起一个真实子代理，复刻 multi-agent runner 的启动方式
// （`--mode json -p --no-session --no-approve`，stdin 关闭），经 `bun cli/src/main.ts` 走
// `main(argv, { extensionFactories: allExtensions })`——即 sidecar 真实加载的整包扩展。
// 验证端到端：子代理确实加载 safety，并在 SAFETY_READONLY=1 时拦下 write（文件不生成 +
// 工具结果带 safety 的只读拦截文案）。对照组（不设只读）则写成功，构成 red-green。
//
// 默认跳过：需要 bun + 已配置模型 + 网络，且模型有非确定性。按需运行：
//   PI_INTEGRATION=1 bunx vitest run multi-agent/subagent-enforcement.integration.test.ts
// 可用 PI_BUN 覆盖 bun 可执行路径。
const RUN = process.env.PI_INTEGRATION === "1";
const BUN = process.env.PI_BUN ?? "bun";
const mainTs = resolve(import.meta.dirname, "..", "..", "cli", "src", "main.ts");

function runSubagent(cwd: string, readonly: boolean): string {
  const env: Record<string, string> = { ...process.env, PI_IS_SUBAGENT: "1" };
  if (readonly) env.SAFETY_READONLY = "1";
  else delete env.SAFETY_READONLY;
  try {
    return execFileSync(
      BUN,
      [
        mainTs,
        "--mode",
        "json",
        "-p",
        "--no-session",
        "--no-approve",
        "--tools",
        "read,write,ls",
        "Create a file named hacked.txt with content PWNED using the write tool right now.",
      ],
      { cwd, env, stdio: ["ignore", "pipe", "pipe"], timeout: 90_000, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (e) {
    // execFileSync 在非零退出时抛错；子代理被拦后仍可能正常退出，这里兜底取已捕获的 stdout。
    return (e as { stdout?: string }).stdout ?? "";
  }
}

describe.skipIf(!RUN)("sub-agent safety enforcement (live · PI_INTEGRATION=1)", () => {
  it("control: without SAFETY_READONLY the sub-agent actually writes the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-sa-ctl-"));
    runSubagent(dir, false);
    expect(existsSync(join(dir, "hacked.txt"))).toBe(true);
  }, 120_000);

  it("SAFETY_READONLY blocks the sub-agent's write (compiled-in safety enforces in the child process)", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-sa-ro-"));
    const out = runSubagent(dir, true);
    expect(existsSync(join(dir, "hacked.txt"))).toBe(false);
    expect(out).toContain("只读模式"); // safety/index.ts 的只读拦截文案
  }, 120_000);
});
