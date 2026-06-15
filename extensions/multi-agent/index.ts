// multi-agent: delegate work to isolated pi sub-agents (separate processes,
// each with its own context window). Single task or several in parallel.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { spawnPiAgent } from "./runner.js";
import { normalizeTasks } from "./tasks.js";
import { resolveProfile, profileToModel, profileToEnv, type ProfileInput } from "./capability.js";
import { createWorktree, worktreeDiff } from "./worktree.js";
import { getConfig } from "../_shared/runtime-config.js";

const MAX_CONCURRENCY = 4;

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "spawn_agent",
    label: "Spawn Sub-agent",
    description:
      "Delegate a task to an isolated sub-agent (a separate pi process with its own context window). " +
      "Provide `task` for one, or `tasks` for several run in parallel. Returns the sub-agent output(s).",
    promptGuidelines: [
      "Use spawn_agent to parallelize independent sub-tasks or to isolate a large exploration from the main context.",
      "Each sub-agent starts fresh — include all context it needs in the task text.",
    ],
    parameters: Type.Object({
      task: Type.Optional(Type.String({ description: "A single task for one sub-agent" })),
      model: Type.Optional(Type.String({ description: "Model (provider/id) for `task`. Omit → SUBAGENT_MODEL or main default." })),
      tasks: Type.Optional(
        Type.Array(
          Type.Union([
            Type.String(),
            Type.Object({ task: Type.String(), model: Type.Optional(Type.String()) }),
          ]),
          { description: "Multiple tasks in parallel; each item may be a string or { task, model }." },
        ),
      ),
      profile: Type.Optional(
        Type.Union(
          [
            Type.String({ description: "Preset profile: explore | planner | executor | reviewer | default" }),
            Type.Object(
              {
                extends: Type.Optional(Type.String()),
                fs: Type.Optional(
                  Type.Union([
                    Type.Literal("readonly"),
                    Type.Literal("workspace"),
                    Type.Object({ writeAllow: Type.Array(Type.String()) }),
                  ]),
                ),
                net: Type.Optional(Type.Boolean()),
                mcp: Type.Optional(Type.Union([Type.Boolean(), Type.Array(Type.String())])),
                spawn: Type.Optional(Type.Boolean()),
                isolation: Type.Optional(
                  Type.Union([Type.Literal("process"), Type.Literal("worktree"), Type.Literal("sandbox")]),
                ),
                model: Type.Optional(Type.String()),
              },
              { additionalProperties: false },
            ),
          ],
          { description: "Capability profile: preset name or inline object. Composable, additive/subtractive." },
        ),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const list = normalizeTasks(params);
      if (!list.length) throw new Error("provide `task` or `tasks`");

      const profile = resolveProfile(params.profile as ProfileInput | undefined);
      if (profile.isolation === "sandbox") {
        throw new Error("isolation 'sandbox' 尚未支持（规划于 P4）；当前支持 process | worktree");
      }
      const wantWorktree = profile.isolation === "worktree";
      if (wantWorktree && list.length !== 1) {
        throw new Error("worktree 隔离仅支持单任务（不支持并行 tasks）");
      }
      const profileModel = profileToModel(profile, getConfig);
      const profileEnv = params.profile ? profileToEnv(profile) : {};

      if (list.length === 1) {
        const { task, model } = list[0];
        const wt = wantWorktree ? await createWorktree(ctx.cwd) : null;
        if (wantWorktree && !wt && getConfig("ISOLATE_FALLBACK") !== "1") {
          throw new Error(
            "无法隔离：当前目录非 git 仓库或无提交。请改用非隔离档案、先 git init + 初始提交，或设 ISOLATE_FALLBACK=1 降级。",
          );
        }
        const runCwd = wt?.dir ?? ctx.cwd;
        try {
          const r = await spawnPiAgent(runCwd, task, {
            model: model ?? profileModel,
            env: profileEnv,
            signal: signal ?? undefined,
            onUpdate: onUpdate
              ? (u) =>
                  onUpdate({
                    content: [{ type: "text", text: u.text }],
                    details: { streaming: true, transcript: u.transcript },
                  })
              : undefined,
          });
          if (!r.ok) throw new Error(`sub-agent failed (exit ${r.exitCode}): ${r.error ?? "unknown error"}`);
          const diff = wt ? await worktreeDiff(wt.dir) : undefined;
          const text = wt
            ? `${r.output || "(no output)"}\n\n---\n### Diff (isolated worktree)\n\n${diff?.trim() ? "```diff\n" + diff + "\n```" : "(no file changes)"}`
            : r.output || "(no output)";
          return {
            content: [{ type: "text", text }],
            details: { exitCode: r.exitCode, transcript: r.transcript, isolated: !!wt, diff },
          };
        } finally {
          if (wt) await wt.cleanup();
        }
      }

      const results: Array<{ task: string; ok: boolean; output: string; error?: string }> = [];
      for (let i = 0; i < list.length; i += MAX_CONCURRENCY) {
        const batch = list.slice(i, i + MAX_CONCURRENCY);
        const settled = await Promise.all(
          batch.map((t) =>
            spawnPiAgent(ctx.cwd, t.task, {
              model: t.model ?? profileModel,
              env: profileEnv,
              signal: signal ?? undefined,
            }),
          ),
        );
        settled.forEach((r, j) => results.push({ task: batch[j].task, ok: r.ok, output: r.output, error: r.error }));
      }

      const body = results
        .map(
          (r, i) =>
            `## Sub-agent ${i + 1}${r.ok ? "" : " (failed)"}\nTask: ${r.task}\n\n${r.ok ? r.output || "(no output)" : `Error: ${r.error}`}`,
        )
        .join("\n\n---\n\n");

      return {
        content: [{ type: "text", text: body }],
        details: { count: results.length, failed: results.filter((r) => !r.ok).length },
      };
    },
  });
}
