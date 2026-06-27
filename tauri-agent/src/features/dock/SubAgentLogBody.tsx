import { useEffect, useState } from 'react';
import { pi } from '../../lib/pi';
import { useOptionalAgentStoreContext } from '../../stores/AgentStoreContext';
import type { SubAgentLogPayload } from '../../stores/dockStore';
import { mapSubAgentStatus } from '../panels/subagentUtils';
import { SubAgentConversation } from '../panels/SubAgentConversation';
import type { DockBodyProps } from './TabBodyRenderer';

const POLL_MS = 2500;

/**
 * registry 后端子代理的兜底会话视图：当浮动列表点击的子代理在当前主对话里
 * 找不到对应 spawn_agent 消息（跨会话 / 后台 spawn）时使用。registry 仅存最终
 * output 文本（无完整 JSONL transcript），故只还原任务 + 输出两条消息。
 *
 * payload 是「点击卡片那一刻」的 registry 快照；后台子代理（如 Dream/Distill）此刻
 * 多半还在运行、output 为空。若只用快照，面板会永久停在「(暂无输出)」（registry 仅在
 * 任务结束才写 output，而打开的 tab payload 不随浮层轮询刷新，需关闭重开才更新）。
 * 故运行中这里按 agentId 自轮询 registry，跑完自动回填 output 并把状态翻成 done。
 */
export function SubAgentLogBody({ tab }: DockBodyProps) {
  const payload = tab.payload as SubAgentLogPayload;
  const workspace = useOptionalAgentStoreContext()?.workspace ?? '';
  const [live, setLive] = useState<{ output: string; status: 'running' | 'done' | 'error' }>({
    output: payload.output ?? '',
    status: payload.status,
  });

  // 再次点击卡片会用新快照覆盖 payload：同步一次，保持与外部一致。
  useEffect(() => {
    setLive({ output: payload.output ?? '', status: payload.status });
  }, [payload.agentId, payload.output, payload.status]);

  // 运行中按 agentId 轮询 registry；进入终态（done/error）后停止轮询。
  useEffect(() => {
    if (!workspace || live.status !== 'running') return;
    let cancelled = false;
    const poll = async () => {
      try {
        const rows = await pi.subagentList(workspace);
        if (cancelled) return;
        const row = rows.find((r) => r.id === payload.agentId);
        if (row) setLive({ output: row.output ?? '', status: mapSubAgentStatus(row.status) });
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
  }, [workspace, payload.agentId, live.status]);

  const result = { content: [{ type: 'text', text: live.output || '(暂无输出)' }] };
  return (
    <SubAgentConversation
      key={tab.id}
      data-testid={`subagent-log-${payload.agentId}`}
      task={payload.task}
      result={result}
      status={live.status}
    />
  );
}
