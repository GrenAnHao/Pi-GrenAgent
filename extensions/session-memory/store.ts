import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function statePath(cwd: string, sessionId: string): string {
  return join(cwd, ".pi", "session-state", `${sessionId}.md`);
}

export function writeState(path: string, md: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, md, "utf8");
}

export function readState(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}
