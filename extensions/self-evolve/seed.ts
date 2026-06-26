// 把默认 persona 播种到 ~/.pi/agent/agents/{dream,distill}.md（if-absent），用户可覆盖。
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getConfig } from "../_shared/runtime-config.js";
import { DISTILL_PERSONA, DREAM_PERSONA } from "./personas.js";

export const SELF_EVOLVE_SEED_VERSION = "2026-06-26";

export function seedPersonas(): void {
  if ((getConfig("SELF_EVOLVE_SEED") ?? "1") === "0") return;
  try {
    const dir = join(getAgentDir(), "agents");
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of [
      ["dream", DREAM_PERSONA],
      ["distill", DISTILL_PERSONA],
    ] as const) {
      const file = join(dir, `${name}.md`);
      if (existsSync(file)) continue;
      writeFileSync(file, content, "utf8");
    }
    writeFileSync(join(dir, ".self-evolve-seed-version"), `${SELF_EVOLVE_SEED_VERSION}\n`, "utf8");
  } catch {
    /* best-effort */
  }
}
