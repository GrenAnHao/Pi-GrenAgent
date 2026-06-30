// 子代理 `--mode json` 的 stdout 随 message_update 呈 O(n^2) 膨胀。运行中若把全量 transcript 每帧经
// IPC 推给前端、或每 tick 全量写进 registry，会压垮 IPC 反序列化 / state 存储（卡爆/OOM），DB 也会写入
// 超大 TEXT。故运行中只保留尾部定长片段供实时预览，完整 transcript 终态也设上限，防极端超大串写进
// registry / session 后重开历史再次卡爆。multi-agent 内联流与 registry 写入共用同一口径。
//
// 注：与 _shared/transcript.ts（AgentMessage[] → role:text 扁平化）职责不同——这里处理的是
// `--mode json` 的 JSONL 字符串尾部截断，仅 multi-agent 的内联流 / registry 写入使用，故就近放置。
export const LIVE_TRANSCRIPT_TAIL = 65536; // 运行中实时预览 transcript 尾部上限（字符）
export const TRANSCRIPT_CAP = 4_000_000; // 终态完整 transcript 上限（字符）

/** 取尾部至多 maxLen 字符，并丢弃因截断产生的首个半行，保持 JSONL 行完整。 */
export function tailLines(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const cut = s.slice(s.length - maxLen);
  const nl = cut.indexOf("\n");
  return nl >= 0 ? cut.slice(nl + 1) : cut;
}
