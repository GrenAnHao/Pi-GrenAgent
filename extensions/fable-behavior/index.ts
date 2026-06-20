// fable-behavior: distilled Fable 5 + coding-agent harness injected each turn via before_agent_start.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getConfig } from "../_shared/runtime-config.js";
import { buildFableBehaviorPrompt, resolveAgentModeFromEntries } from "./loader.js";
import { seedFableAgents } from "./seed.js";

const enabled = () => (getConfig("FABLE_BEHAVIOR") ?? "1") !== "0";
const tier2 = () => (getConfig("FABLE_BEHAVIOR_TIER2") ?? "1") !== "0";
const tier2P1 = () => (getConfig("FABLE_BEHAVIOR_TIER2_P1") ?? "1") !== "0";
const tier3 = () => (getConfig("FABLE_BEHAVIOR_TIER3_GUIDELINES") ?? "1") !== "0";

export default function (pi: ExtensionAPI) {
  console.error("[fable-behavior] extension loaded");

  pi.on("session_start", async () => {
    seedFableAgents();
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    if (!enabled()) return undefined;

    const entries = ctx.sessionManager.getEntries() as Array<{
      type?: string;
      customType?: string;
      data?: unknown;
    }>;
    const mode = resolveAgentModeFromEntries(entries);
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const content = buildFableBehaviorPrompt({
      tier2: tier2(),
      tier2P1: tier2P1(),
      tier3Guidelines: tier3(),
      mode,
      date,
    });

    return {
      message: {
        customType: "fable-behavior",
        content,
        display: false,
      },
    };
  });
}
