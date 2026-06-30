// Isolated execution via `git worktree`: a separate working dir + detached HEAD
// so a sub-agent can edit files without touching the user's main checkout.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Windows-safe git flags (autocrlf off so snapshots are byte-faithful; long paths + quotepath off).
const FLAGS = ["-c", "core.autocrlf=false", "-c", "core.longpaths=true", "-c", "core.quotepath=false"];

export interface Worktree {
  dir: string;
  cleanup: () => Promise<void>;
}

export function gitWorktreeAddArgs(repo: string, dir: string): string[] {
  return [...FLAGS, "-C", repo, "worktree", "add", "--detach", dir];
}

export function gitWorktreeRemoveArgs(repo: string, dir: string): string[] {
  return [...FLAGS, "-C", repo, "worktree", "remove", "--force", dir];
}

function git(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (e) => resolve({ code: -1, stdout, stderr: e.message }));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  const r = await git(["-C", cwd, "rev-parse", "--is-inside-work-tree"]);
  return r.code === 0 && r.stdout.trim() === "true";
}

/** Create an isolated worktree off `cwd`. Returns null if not a git repo or add fails (e.g. no commits yet). */
export async function createWorktree(cwd: string): Promise<Worktree | null> {
  if (!(await isGitRepo(cwd))) return null;
  const dir = mkdtempSync(join(tmpdir(), "grenagent-wt-"));
  const r = await git(gitWorktreeAddArgs(cwd, dir));
  if (r.code !== 0) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return null;
  }
  return {
    dir,
    cleanup: async () => {
      await git(gitWorktreeRemoveArgs(cwd, dir));
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* worktree remove may already have cleaned it */
      }
    },
  };
}

/** Unified diff of all changes (incl. new files) made inside the worktree. */
export async function worktreeDiff(dir: string): Promise<string> {
  await git(["-C", dir, "add", "-A"]);
  return (await git(["-C", dir, "diff", "--cached"])).stdout;
}
