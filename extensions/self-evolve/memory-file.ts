// 读取 MEMORY.md 并格式化为注入正文（项目优先、带预算上限）。纯函数，便于单测。
import { readFileSync } from "node:fs";

export function readMemoryFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** 把项目/全局 MEMORY.md 拼成注入正文；超 maxChars 时项目优先、必要时截断。 */
export function formatInjection(project: string, global: string, maxChars: number): string {
  const parts: Array<{ title: string; body: string }> = [];
  if (project.trim()) parts.push({ title: "Project memory", body: project.trim() });
  if (global.trim()) parts.push({ title: "Global memory", body: global.trim() });
  let out = "";
  for (const part of parts) {
    const block = `# ${part.title}\n\n${part.body}`;
    const next = out ? `${out}\n\n${block}` : block;
    if (next.length > maxChars) {
      if (!out) out = next.slice(0, maxChars);
      break;
    }
    out = next;
  }
  return out;
}
