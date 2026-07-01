import { useEffect, useState } from 'react';
import { pi, type SubAgentItem } from '../lib/pi';
import { latestSubAgentStep } from '../features/panels/subagentUtils';

const POLL_MS = 2500;

export interface SubAgentLive {
  model: string | null;
  step: number | null;
  action: string | null;
}

/**
 * 在 registry 里定位「本卡片对应的运行中子代理行」：
 * - 有 agentId（后台 spawn，或工具已返回带回 details.agentId）：直接按 id 命中。
 * - 无 agentId（前台 spawn 运行中：spawn_agent 工具尚未返回，result 仍是 undefined）：先按 task
 *   精确匹配仍在 running 的行；task 因格式化对不上、但当前只有一个 running 时用它兜底；多个
 *   running 又无精确匹配则不猜（返回 undefined，保持「运行中…」），避免把 A 卡片错配到 B 子代理。
 */
function matchRunningRow(
  rows: SubAgentItem[],
  agentId: string | null,
  task: string | undefined,
): SubAgentItem | undefined {
  if (agentId) return rows.find((r) => r.id === agentId);
  const runningRows = rows.filter((r) => r.status === 'running');
  const t = task?.trim();
  if (t) {
    const exact = runningRows.find((r) => (r.task ?? '').trim() === t);
    if (exact) return exact;
  }
  return runningRows.length === 1 ? runningRows[0] : undefined;
}

/**
 * 运行中轮询 registry，解析模型 + 最新一步；非运行时静默。
 * 前台 spawn 运行中拿不到 agentId 时按 task 回退匹配（见 matchRunningRow），使前台子代理也能实时
 * 显示模型与步骤（原先无 agentId 直接 return、一直只有「运行中…」，模型/进度全无）。
 */
export function useSubAgentLive(
  workspace: string,
  agentId: string | null,
  running: boolean,
  task?: string,
): SubAgentLive {
  const [live, setLive] = useState<SubAgentLive>({ model: null, step: null, action: null });

  useEffect(() => {
    if (!workspace || !running) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const rows = await pi.subagentList(workspace);
        if (cancelled) return;
        const row = matchRunningRow(rows, agentId, task);
        if (!row) return;
        const ls = latestSubAgentStep(row.transcript ?? '');
        setLive({ model: row.model ?? null, step: ls?.step ?? null, action: ls?.action ?? null });
      } catch {
        // 跨进程读 registry 偶发 SQLITE_BUSY：保留上次结果，下个 tick 再试。
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [workspace, agentId, running, task]);

  return live;
}
