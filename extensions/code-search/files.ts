import { extname } from "node:path";
import { walkDir } from "../_shared/fs-walk.js";

/** Recursively list code files under `root` whose extension is in `exts`. */
export function listCodeFiles(root: string, exts: Set<string>, maxFiles = 2000): string[] {
  const out: string[] = [];
  walkDir(
    root,
    (full) => {
      if (out.length < maxFiles && exts.has(extname(full))) out.push(full);
    },
    () => out.length >= maxFiles,
  );
  return out;
}
