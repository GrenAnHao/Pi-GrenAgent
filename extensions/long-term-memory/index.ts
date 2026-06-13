// long-term-memory: durable memory for the Pi coding agent, with two scopes
// (project: <cwd>/.pi/memory/memory.db, global: ~/.pi/agent/memory.db) and
// optional auto-capture of explicit "记住: ..." / "remember: ..." statements.
//
// Tools (LLM-callable):
//   memory_save({ text, category?, scope? })  - persist a memory
//   memory_recall({ query, topK? })           - recall across both scopes
// Command:
//   /memory list | /memory forget <id> | /memory clear [project|global|all]
//
// Each prompt auto-recalls relevant memories (both scopes) and injects them.

import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type EmbeddingConfig, resolveEmbeddingConfig } from "./embedding.js";
import { extractMemories } from "./extractor.js";
import { type MemoryHit, MemoryStore } from "./store.js";

const AUTO_INJECT = (process.env.MEMORY_AUTO_INJECT ?? "1") !== "0";
const AUTO_INJECT_TOPK = Number(process.env.MEMORY_AUTO_TOPK ?? "5") || 5;
const AUTO_INJECT_MAX_CHARS = 4000;
const AUTO_CAPTURE = (process.env.MEMORY_AUTO_CAPTURE ?? "1") !== "0";
const AUTO_EXTRACT = (process.env.MEMORY_EXTRACT ?? "0") !== "0";

type ScopedHit = MemoryHit & { scope: "project" | "global" };

function messageToText(m: unknown): string {
  const obj = (m ?? {}) as { role?: string; content?: unknown; message?: { role?: string; content?: unknown } };
  const role = obj.role ?? obj.message?.role ?? "";
  const content = obj.content ?? obj.message?.content;
  let text = "";
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter((p): p is { type: string; text: string } => !!p && typeof p === "object" && (p as { type?: string }).type === "text")
      .map((p) => p.text)
      .join(" ");
  }
  return text ? `${role}: ${text}` : "";
}

export default function (pi: ExtensionAPI) {
  let projectStore: MemoryStore | undefined;
  let globalStore: MemoryStore | undefined;
  let projectPath = "";
  let globalPath = "";

  const ensureStores = (cwd: string): { project: MemoryStore; global: MemoryStore } => {
    if (!projectStore) {
      projectPath = join(cwd, ".pi", "memory", "memory.db");
      projectStore = new MemoryStore(projectPath);
      projectStore.load();
    }
    if (!globalStore) {
      globalPath = process.env.MEMORY_GLOBAL_DB ?? join(homedir(), ".pi", "agent", "long-term-memory.db");
      globalStore = new MemoryStore(globalPath);
      globalStore.load();
    }
    return { project: projectStore, global: globalStore };
  };

  const recallMerged = async (
    cwd: string,
    query: string,
    topK: number,
    config: EmbeddingConfig,
  ): Promise<ScopedHit[]> => {
    const { project, global } = ensureStores(cwd);
    const [p, g] = await Promise.all([
      project.recall(query, topK, config).catch(() => []),
      global.recall(query, topK, config).catch(() => []),
    ]);
    const tagged: ScopedHit[] = [
      ...p.map((h) => ({ ...h, scope: "project" as const })),
      ...g.map((h) => ({ ...h, scope: "global" as const })),
    ];
    tagged.sort((a, b) => b.score - a.score);

    const merged: ScopedHit[] = [];
    const seen = new Set<string>();
    for (const h of tagged) {
      if (seen.has(h.memory.id)) continue;
      seen.add(h.memory.id);
      merged.push(h);
      if (merged.length >= topK) break;
    }
    return merged;
  };

  pi.on("session_start", async (_event, ctx) => {
    ensureStores(ctx.cwd);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const prompt = typeof event.prompt === "string" ? event.prompt.trim() : "";
    if (!prompt) return undefined;

    const { project } = ensureStores(ctx.cwd);
    const config = resolveEmbeddingConfig();

    // Auto-capture: explicit "记住: ..." / "remember: ..." statements only (low noise).
    if (AUTO_CAPTURE) {
      const m = prompt.match(/^\s*(?:记住|remember)\s*[:：]\s*(.+)/is);
      const captured = m?.[1]?.trim();
      if (captured) {
        await project.save(captured, "auto", config).catch(() => {});
      }
    }

    if (!AUTO_INJECT) return undefined;

    const hits = await recallMerged(ctx.cwd, prompt, AUTO_INJECT_TOPK, config).catch(() => []);
    if (!hits.length) return undefined;

    let body = "";
    for (const h of hits) {
      const tag = h.memory.category ? `[${h.memory.category}] ` : "";
      const line = `- ${tag}${h.memory.text} (${h.scope})`;
      if (body.length + line.length > AUTO_INJECT_MAX_CHARS) break;
      body += (body ? "\n" : "") + line;
    }
    if (!body) return undefined;

    return {
      message: {
        customType: "long-term-memory",
        content: `# Relevant long-term memory (auto-recalled)\n\n${body}`,
        display: true,
      },
    };
  });

  // Auto-extract: after each prompt, spawn a sub-agent to pull durable facts
  // from the conversation and save them. Off by default (MEMORY_EXTRACT=1 to enable)
  // since it adds an LLM call per turn.
  pi.on("agent_end", async (event, ctx) => {
    if (!AUTO_EXTRACT) return;
    const messages = Array.isArray((event as { messages?: unknown[] })?.messages)
      ? (event as { messages: unknown[] }).messages
      : [];
    const convo = messages.map(messageToText).filter(Boolean).join("\n").slice(0, 12000);
    if (!convo.trim()) return;

    const { project } = ensureStores(ctx.cwd);
    const config = resolveEmbeddingConfig();
    const facts = await extractMemories(ctx.cwd, convo).catch(() => []);
    for (const fact of facts.slice(0, 10)) {
      await project.save(fact, "extracted", config).catch(() => {});
    }
  });

  pi.registerTool({
    name: "memory_save",
    label: "Save Memory",
    description:
      "Save a durable long-term memory: a preference, decision, convention, or fact. " +
      "scope 'project' (default) stores it for this repo; scope 'global' stores it across all projects. " +
      "Use whenever the user reveals something worth remembering across sessions.",
    promptGuidelines: [
      "When the user states a lasting preference/decision/convention, call memory_save.",
      "Use scope 'global' for cross-project preferences (e.g. preferred language), 'project' for repo-specific rules.",
      "Keep each memory short and atomic.",
    ],
    parameters: Type.Object({
      text: Type.String({ description: "The fact to remember (short, atomic)" }),
      category: Type.Optional(Type.String({ description: "Optional tag: preference | decision | convention | fact" })),
      scope: Type.Optional(Type.String({ description: "'project' (default) or 'global'" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { project, global } = ensureStores(ctx.cwd);
      const text = (params.text ?? "").trim();
      if (!text) throw new Error("memory text must be non-empty");

      const scope = params.scope === "global" ? "global" : "project";
      const store = scope === "global" ? global : project;
      const config = resolveEmbeddingConfig();
      const { id } = await store.save(text, params.category ?? null, config, signal ?? undefined);
      return {
        content: [
          {
            type: "text",
            text: `Saved ${scope} memory [${id}]${params.category ? ` (${params.category})` : ""}: ${text}`,
          },
        ],
        details: { id, scope, category: params.category ?? null, embedded: config.enabled },
      };
    },
  });

  pi.registerTool({
    name: "memory_recall",
    label: "Recall Memory",
    description: "Recall relevant long-term memories (both project and global scopes) for the given query.",
    parameters: Type.Object({
      query: Type.String({ description: "What to recall about" }),
      topK: Type.Optional(Type.Number({ description: "Max memories to return (default 5)" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const config = resolveEmbeddingConfig();
      const hits = await recallMerged(ctx.cwd, params.query, params.topK ?? 5, config).catch(() => []);
      if (!hits.length) {
        return { content: [{ type: "text", text: "No relevant memories." }], details: { hits: [] } };
      }
      const body = hits
        .map(
          (h, i) =>
            `${i + 1}. ${h.memory.category ? `[${h.memory.category}] ` : ""}${h.memory.text} (${h.scope}, score ${h.score.toFixed(3)})`,
        )
        .join("\n");
      return {
        content: [{ type: "text", text: `Recalled ${hits.length} memory(ies):\n${body}` }],
        details: { hits: hits.map((h) => ({ id: h.memory.id, scope: h.scope, score: Number(h.score.toFixed(4)) })) },
      };
    },
  });

  pi.registerCommand("memory", {
    description: "Manage memory: /memory list | /memory forget <id> | /memory clear [project|global|all]",
    handler: async (args, ctx) => {
      const { project, global } = ensureStores(ctx.cwd);
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const sub = parts[0] ?? "list";

      if (sub === "add") {
        const text = parts.slice(1).join(" ").trim();
        if (!text) {
          ctx.ui.notify("Usage: /memory add <text>", "warn");
          return;
        }
        const config = resolveEmbeddingConfig();
        const { id } = await project.save(text, "manual", config);
        ctx.ui.notify(`Saved project memory [${id}]: ${text}`, "success");
        return;
      }

      if (sub === "promote") {
        const id = parts[1];
        if (!id) {
          ctx.ui.notify("Usage: /memory promote <id>", "warn");
          return;
        }
        const m = project.list(1000).find((x) => x.id === id);
        if (!m) {
          ctx.ui.notify(`No project memory ${id}.`, "warn");
          return;
        }
        const config = resolveEmbeddingConfig();
        await global.save(m.text, m.category ?? null, config);
        project.forget(id);
        ctx.ui.notify(`Promoted ${id} to global memory.`, "success");
        return;
      }

      if (sub === "list") {
        const lines = [
          ...project.list(50).map((m) => `[${m.id}] (project${m.category ? `/${m.category}` : ""}) ${m.text}`),
          ...global.list(50).map((m) => `[${m.id}] (global${m.category ? `/${m.category}` : ""}) ${m.text}`),
        ];
        ctx.ui.notify(lines.length ? `${lines.length} memory(ies):\n${lines.join("\n")}` : "No memories stored.", "info");
        return;
      }

      if (sub === "clear") {
        const scope = parts[1] ?? "all";
        if (scope === "project" || scope === "all") project.clear();
        if (scope === "global" || scope === "all") global.clear();
        ctx.ui.notify(`Cleared ${scope} memory.`, "info");
        return;
      }

      if (sub === "forget") {
        const id = parts[1];
        if (!id) {
          ctx.ui.notify("Usage: /memory forget <id>", "warn");
          return;
        }
        const ok = project.forget(id) || global.forget(id);
        ctx.ui.notify(ok ? `Forgot memory ${id}.` : `No memory with id ${id}.`, ok ? "success" : "warn");
        return;
      }

      ctx.ui.notify("Usage: /memory list | /memory forget <id> | /memory clear [project|global|all]", "warn");
    },
  });
}
