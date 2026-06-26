// 把诊断渲染成文本并 patch 进 tool result content。纯逻辑，复用 diagnostics 的 Diagnostic 类型。
import type { Diagnostic } from "../diagnostics/parsers.js";

export function renderDiagnostics(diags: Diagnostic[], max: number): string {
  const shown = diags
    .slice(0, max)
    .map((d) => `${d.severity.toUpperCase()} ${d.file}:${d.line}${d.col ? `:${d.col}` : ""} [${d.source}] ${d.message}`);
  const rest = diags.length - shown.length;
  if (rest > 0) shown.push(`... 还有 ${rest} 条`);
  return shown.join("\n");
}

export type ContentBlock = { type: string; text?: string };

/** 在原 tool result content 末尾追加一段诊断文本块（不改原内容）。 */
export function patchContent<T extends ContentBlock>(
  original: T[],
  diagText: string,
): Array<T | { type: "text"; text: string }> {
  return [...original, { type: "text", text: `\n[写后诊断]\n${diagText}` }];
}
