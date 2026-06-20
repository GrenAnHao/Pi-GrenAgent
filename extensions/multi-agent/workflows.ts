// Workflow slash-commands (/implement, /scout-and-plan, /implement-and-review)
// that expand to an instruction telling the main agent to run a spawn_agent
// `chain`. Also seeds a set of default named agents (scout/planner/reviewer/
// worker) into <agentDir>/agents so the workflows work out of the box.
//
// Aligned with pi's official examples/extensions/subagent (agents + prompts).

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_AGENT_TEMPLATES } from "../fable-behavior/default-agents.js";

// Default agents seeded only when absent. Enriched templates from fable-behavior.
const DEFAULT_AGENTS = DEFAULT_AGENT_TEMPLATES;

function seedDefaultAgents(): void {
  try {
    const dir = join(getAgentDir(), "agents");
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(DEFAULT_AGENTS)) {
      const file = join(dir, `${name}.md`);
      if (!existsSync(file)) writeFileSync(file, content, "utf8");
    }
  } catch {
    /* best-effort: missing default agents just means /implement etc. report "unknown agent" */
  }
}

interface Workflow {
  description: string;
  build: (query: string) => string;
}

const WORKFLOWS: Record<string, Workflow> = {
  implement: {
    description: "Chain scout -> planner -> worker to implement a request end-to-end",
    build: (q) =>
      [
        `Use the spawn_agent tool with a \`chain\` to implement the request below.`,
        `Pass each step's output to the next via the {previous} placeholder. Request:`,
        ``,
        q,
        ``,
        `Call spawn_agent once, e.g.:`,
        `spawn_agent({ chain: [`,
        `  { agent: "scout",   task: "Find all code relevant to: ${q}" },`,
        `  { agent: "planner", task: "Create an implementation plan for this request using the context:\\n{previous}" },`,
        `  { agent: "worker",  task: "Implement this plan:\\n{previous}" }`,
        `] })`,
      ].join("\n"),
  },
  "scout-and-plan": {
    description: "Chain scout -> planner to research and plan (no implementation)",
    build: (q) =>
      [
        `Use the spawn_agent tool with a \`chain\` to research and plan the request below (do NOT implement).`,
        `Pass output between steps via {previous}. Request:`,
        ``,
        q,
        ``,
        `spawn_agent({ chain: [`,
        `  { agent: "scout",   task: "Find all code relevant to: ${q}" },`,
        `  { agent: "planner", task: "Create an implementation plan for this request using the context:\\n{previous}" }`,
        `] })`,
      ].join("\n"),
  },
  "implement-and-review": {
    description: "Chain worker -> reviewer -> worker to implement, review, then apply feedback",
    build: (q) =>
      [
        `Use the spawn_agent tool with a \`chain\` to implement, review, then apply feedback for the request below.`,
        `Pass output between steps via {previous}. Request:`,
        ``,
        q,
        ``,
        `spawn_agent({ chain: [`,
        `  { agent: "worker",   task: "Implement: ${q}" },`,
        `  { agent: "reviewer", task: "Review the implementation from the previous step:\\n{previous}" },`,
        `  { agent: "worker",   task: "Apply the review feedback:\\n{previous}" }`,
        `] })`,
      ].join("\n"),
  },
};

/** Register the workflow slash-commands and seed default agents. No-op inside sub-agents. */
export function registerWorkflows(pi: ExtensionAPI): void {
  if (process.env.PI_IS_SUBAGENT === "1") return; // sub-agents don't use slash commands
  seedDefaultAgents();
  for (const [name, wf] of Object.entries(WORKFLOWS)) {
    pi.registerCommand(name, {
      description: wf.description,
      handler: async (args, ctx) => {
        const query = args.trim();
        if (!query) {
          ctx.ui.notify(`Usage: /${name} <request>`, "warning");
          return;
        }
        if (typeof ctx.isIdle === "function" && !ctx.isIdle()) {
          ctx.ui.notify("Agent is busy — try again once it's idle.", "warning");
          return;
        }
        pi.sendUserMessage(wf.build(query));
      },
    });
  }
}
