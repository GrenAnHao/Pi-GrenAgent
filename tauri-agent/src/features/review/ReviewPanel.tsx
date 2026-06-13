import { ActionIcon, Flexbox } from '@lobehub/ui';
import { Bot, FileText, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAgentStoreContext } from '../../stores/AgentStoreContext';
import { pi, type ReviewNote } from '../../lib/pi';
import { ManagerLayout } from '../common/ManagerLayout';

const muted = 'var(--gren-fg-muted, #9aa1ac)';
const border = '1px solid var(--gren-border, rgba(255,255,255,0.08))';

const SEVERITY_ORDER = ['blocker', 'major', 'minor', 'nit', 'praise'];
const SEVERITY_COLOR: Record<string, string> = {
  blocker: '#f87171',
  major: '#fb923c',
  minor: '#facc15',
  nit: '#9aa1ac',
  praise: '#4ade80',
};

export function ReviewPanel() {
  const { workspace } = useAgentStoreContext();
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<string>('');

  const reload = useCallback(() => {
    setError(null);
    void pi
      .rvList(workspace)
      .then((list) => setNotes(list))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [workspace]);

  useEffect(() => {
    reload();
  }, [reload]);

  const groups = useMemo(() => {
    const extras = [...new Set(notes.map((n) => n.severity))].filter(
      (s) => !SEVERITY_ORDER.includes(s),
    );
    const order = [...SEVERITY_ORDER, ...extras];
    return order
      .map((sev) => ({ sev, items: notes.filter((n) => n.severity === sev) }))
      .filter((g) => g.items.length > 0);
  }, [notes]);

  const selected = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId],
  );

  useEffect(() => {
    if (!selected) {
      setDiff('');
      return;
    }
    let alive = true;
    void pi
      .getGitDiff(workspace, selected.file)
      .then((d) => {
        if (alive) setDiff(d);
      })
      .catch(() => {
        if (alive) setDiff('');
      });
    return () => {
      alive = false;
    };
  }, [workspace, selected]);

  const onClear = useCallback(async () => {
    if (!window.confirm('确定清空审查发现？')) return;
    await pi.runCommand(workspace, '/review clear');
    setSelectedId(null);
    reload();
  }, [workspace, reload]);

  const onReport = useCallback(async () => {
    await pi.runCommand(workspace, '/review report');
  }, [workspace]);

  const onAgentReview = useCallback(() => {
    void pi.prompt(
      workspace,
      '请审查当前工作区改动：用 git_diff 获取 diff，逐条用 review_note 记录发现（severity/file/line/message）。',
    );
  }, [workspace]);

  const header = (
    <Flexbox horizontal align="center" gap={12} data-testid="rv-header" style={{ fontSize: 13, width: '100%' }}>
      <span>{notes.length} 条发现</span>
      <div style={{ flex: 1 }} />
      <ActionIcon data-testid="rv-agent" icon={Bot} size="small" title="让 agent 审查" onClick={() => void onAgentReview()} />
      <ActionIcon data-testid="rv-report" icon={FileText} size="small" title="生成报告" onClick={() => void onReport()} />
      <ActionIcon data-testid="rv-clear" icon={Trash2} size="small" title="清空发现" onClick={() => void onClear()} />
    </Flexbox>
  );

  let list: ReactNode;
  if (error) {
    list = <div style={{ padding: 14, fontSize: 12, color: muted }}>读取失败：{error}</div>;
  } else if (notes.length === 0) {
    list = (
      <div data-testid="rv-empty" style={{ padding: 14, fontSize: 12, color: muted }}>
        暂无审查发现
      </div>
    );
  } else {
    list = (
      <Flexbox>
        {groups.map((g) => (
          <Flexbox key={g.sev}>
            <div style={{ padding: '6px 12px', fontSize: 11, color: muted }}>
              {g.sev}（{g.items.length}）
            </div>
            {g.items.map((n) => {
              const active = n.id === selectedId;
              return (
                <button
                  key={n.id}
                  data-testid={`rv-note-${n.id}`}
                  onClick={() => setSelectedId(n.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    border: 'none',
                    borderBottom: border,
                    cursor: 'pointer',
                    textAlign: 'left',
                    background: active
                      ? 'var(--gren-rail-active, rgba(255,255,255,0.08))'
                      : 'transparent',
                    color: 'inherit',
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      flex: '0 0 auto',
                      background: SEVERITY_COLOR[n.severity] ?? muted,
                    }}
                  />
                  <span
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {n.file}
                    {n.line != null ? `:${n.line}` : ''}
                  </span>
                </button>
              );
            })}
          </Flexbox>
        ))}
      </Flexbox>
    );
  }

  const detail = selected ? (
    <Flexbox gap={10} data-testid="rv-detail">
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>{selected.message}</div>
      <Flexbox gap={4} style={{ fontSize: 12, color: muted }}>
        <span>severity：{selected.severity}</span>
        <span>
          位置：{selected.file}
          {selected.line != null ? `:${selected.line}` : ''}
        </span>
      </Flexbox>
      {diff && (
        <pre
          data-testid="rv-diff"
          style={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            border,
            borderRadius: 8,
            padding: 10,
            color: muted,
            maxHeight: 240,
            overflow: 'auto',
          }}
        >
          {diff}
        </pre>
      )}
    </Flexbox>
  ) : (
    <div style={{ color: muted, fontSize: 13 }}>选择左侧发现查看详情</div>
  );

  return <ManagerLayout testId="review-panel" header={header} list={list} detail={detail} />;
}
