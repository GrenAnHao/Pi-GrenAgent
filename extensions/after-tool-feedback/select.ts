// 选取被编辑的文件路径 + 去重「新增」诊断。纯逻辑。
import type { Diagnostic } from "../diagnostics/parsers.js";

export function extractEditedPaths(event: { toolName: string; input: Record<string, unknown> }): string[] {
  if (event.toolName !== "edit" && event.toolName !== "write") return [];
  const p = event.input?.path;
  return typeof p === "string" && p.length > 0 ? [p] : [];
}

const key = (d: Diagnostic) => `${d.file}|${d.line}|${d.col ?? ""}|${d.severity}|${d.message}`;

/** 只保留 curr 中 prev 没有的诊断（避免把同一批旧诊断反复回灌刷屏）。 */
export function diffNewDiagnostics(prev: Diagnostic[], curr: Diagnostic[]): Diagnostic[] {
  const seen = new Set(prev.map(key));
  return curr.filter((d) => !seen.has(key(d)));
}
