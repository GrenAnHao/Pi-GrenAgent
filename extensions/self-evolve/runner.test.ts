import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { spawnPiAgent } = vi.hoisted(() => ({
  spawnPiAgent: vi.fn(async () => ({ ok: true, output: "consolidated 3 facts", exitCode: 0, transcript: "" })),
}));

vi.mock("../multi-agent/runner.js", () => ({ spawnPiAgent }));

import { SubAgentRegistry } from "../multi-agent/registry.js";
import { startEvolveJob, waitEvolveJob } from "./runner.js";

describe("startEvolveJob", () => {
  let dir: string;
  let reg: SubAgentRegistry;

  afterEach(() => {
    reg?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
    spawnPiAgent.mockClear();
  });

  it("registers running row and calls spawnPiAgent with SELF_EVOLVE_CHILD", async () => {
    dir = mkdtempSync(join(tmpdir(), "se-run-"));
    reg = new SubAgentRegistry(join(dir, ".pi", "subagents", "registry.db"));
    const done = vi.fn();
    const { id } = startEvolveJob(
      { agent: "dream", cwd: dir, source: "manual", timeoutMs: 5000 },
      { onComplete: done },
    );
    expect(id).toMatch(/^sa-/);
    expect(spawnPiAgent).toHaveBeenCalledTimes(1);
    const env = spawnPiAgent.mock.calls[0][2].env as Record<string, string>;
    expect(env.SELF_EVOLVE_CHILD).toBe("1");
    await waitEvolveJob(id, dir);
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ ok: true, id }));
    expect(reg.get(id)?.status).toBe("done");
    expect(reg.get(id)?.task).toBe("Dream（手动）");
  });

  it("labels auto distill as Auto Distill", async () => {
    dir = mkdtempSync(join(tmpdir(), "se-run-"));
    reg = new SubAgentRegistry(join(dir, ".pi", "subagents", "registry.db"));
    const { id } = startEvolveJob({ agent: "distill", cwd: dir, source: "auto", timeoutMs: 5000 });
    await waitEvolveJob(id, dir);
    expect(reg.get(id)?.task).toBe("Auto Distill");
  });
});
