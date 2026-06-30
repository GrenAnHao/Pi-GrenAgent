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
 * 找不到对应 spawn_agent 消息（跨会话 / 后台 spawn）时使用。
 *
 * registry 运行期会增量写入子代理的原始 JSONL transcript，故这里轮询到 transcript 后直接
 * 交给 SubAgentConversation 用主对话同款渲染（完整工具调用 + 文本流）实时回放；没有 transcript
 *（旧数据）时退回 registry 的 output 文本。
 *
 * payload 是「点击卡片那一刻」的 registry 快照；后台子代理（如 Dream/Distill）此刻多半还在运行，
 * 而 tab payload 不随浮层轮询刷新。故运行中这里按 agentId 自轮询 registry，实时回填 transcript/output，
 * 跑完把状态翻成 done 并停止轮询。
 */
export function SubAgentLogBody({ tab }: DockBodyProps) {
  const payload = tab.payload as SubAgentLogPayload;
  const workspace = useOptionalAgentStoreContext()?.workspace ?? '';
  const [live, setLive] = useState<{ output: string; transcript: string; status: 'running' | 'done' | 'error' }>({
    output: payload.output ?? '',
    transcript: payload.transcript ?? '',
    status: payload.status,
  });

  // 再次点击卡片会用新快照覆盖 payload：同步一次，保持与外部一致。
  useEffect(() => {
    setLive({ output: payload.output ?? '', transcript: payload.transcript ?? '', status: payload.status });
  }, [payload.agentId, payload.output, payload.transcript, payload.status]);

  // 运行中按 agentId 轮询 registry；进入终态（done/error）后停止轮询。
  useEffect(() => {
    if (!workspace || live.status !== 'running') return;
    let cancelled = false;
    const poll = async () => {
      try {
        const rows = await pi.subagentList(workspace);
        if (cancelled) return;
        const row = rows.find((r) => r.id === payload.agentId);
        if (row)
          setLive({
            output: row.output ?? '',
            transcript: row.transcript ?? '',
            status: mapSubAgentStatus(row.status),
          });
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

  // 有 transcript → 走 details.transcript 的完整 JSONL 回放（与主对话内联 spawn_agent 同款渲染）；
  // 无 transcript（旧数据 / 首帧未到）→ 退回纯 output 文本兜底。
  const result = live.transcript
    ? { details: { transcript: live.transcript } }
    : { content: [{ type: 'text', text: live.output || '(暂无输出)' }] };
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
