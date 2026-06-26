// Shared filesystem traversal: skip the usual build/vcs dirs + hidden dirs and
// visit every file under a root. Callers supply their own per-file filtering and
// stop condition (extension / glob / size / count limit). No external deps.
import { type Dirent, readdirSync } from "node:fs";
import { join } from "node:path";

export const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".pi",
  "dist",
  "build",
  "out",
  ".next",
  "coverage",
  "target",
  "vendor",
]);

/**
 * Recursively walk files under `root`, skipping SKIP_DIRS and hidden (dot) dirs.
 * `onFile(fullPath)` is invoked for each file; traversal halts as soon as
 * `stop()` returns true (callers use it to enforce a result-count limit).
 */
export function walkDir(root: string, onFile: (fullPath: string) => void, stop: () => boolean = () => false): void {
  const walk = (dir: string): void => {
    if (stop()) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (stop()) return;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) walk(full);
      } else if (e.isFile()) {
        onFile(full);
      }
    }
  };
  walk(root);
}
