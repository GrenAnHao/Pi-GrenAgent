import { ActionIcon, Flexbox } from '@lobehub/ui';
import { Undo2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAgentStoreContext } from '../../stores/AgentStoreContext';
import { pi, type MemHistoryItem } from '../../lib/pi';

const muted = 'var(--gren-fg-muted, #9aa1ac)';
const border = '1px solid var(--gren-border, rgba(255,255,255,0.08))';

const opColor: Record<string, string> = {
  ADD: '#4ade80',
  UPDATE: '#fbbf24',
  DELETE: '#f87171',
  ROLLBACK: '#60a5fa',
};

interface MemoryHistoryProps {
  /** 仅看某条记忆的版本史；不传＝全量时间线。 */
  memoryId?: string;
}

export function MemoryHistory({ memoryId }: MemoryHistoryProps) {
  const { workspace } = useAgentStoreContext();
  const [rows, setRows] = useState<MemHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    void pi
      .memHistory(workspace, memoryId)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [workspace, memoryId]);

  useEffect(() => reload(), [reload]);

  const onRollback = useCallback(
    async (historyId: number) => {
      if (!window.confirm(`回滚变更 #${historyId}？`)) return;
      await pi.runCommand(workspace, `/memory rollback ${historyId}`);
      reload();
    },
    [workspace, reload],
  );

  if (error) return <div style={{ padding: 14, fontSize: 12, color: muted }}>读取失败：{error}</div>;
  if (rows.length === 0)
    return (
      <div data-testid="mem-hist-empty" style={{ padding: 14, fontSize: 12, color: muted }}>
        暂无变更历史
      </div>
    );

  return (
    <Flexbox data-testid="mem-history">
      {rows.map((r) => (
        <Flexbox
          key={r.historyId}
          horizontal
          align="center"
          gap={8}
          data-testid={`mem-hist-${r.historyId}`}
          style={{ padding: '8px 12px', borderBottom: border, fontSize: 12 }}
        >
          <span style={{ color: opColor[r.op] ?? muted, fontWeight: 600, minWidth: 64 }}>{r.op}</span>
          <Flexbox style={{ flex: 1, minWidth: 0 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(r.oldText ?? '∅') + ' → ' + (r.newText ?? '∅')}
            </span>
            <span style={{ color: muted, fontSize: 11 }}>
              {r.scope} · v{r.version}
              {r.reason ? ` · ${r.reason}` : ''}
            </span>
          </Flexbox>
          <ActionIcon
            data-testid={`mem-hist-rollback-${r.historyId}`}
            icon={Undo2}
            size="small"
            title="回滚此次变更"
            onClick={() => void onRollback(r.historyId)}
          />
        </Flexbox>
      ))}
    </Flexbox>
  );
}
