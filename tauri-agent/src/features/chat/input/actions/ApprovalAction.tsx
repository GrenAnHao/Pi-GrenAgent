import { Icon } from '@lobehub/ui';
import { Select } from '@lobehub/ui/base-ui';
import { Hand, Shield, ShieldAlert, type LucideIcon } from 'lucide-react';
import { pi } from '../../../../lib/pi';
import {
  APPROVAL_LABELS,
  APPROVAL_POLICIES,
  type ApprovalPolicy,
  useApprovalStore,
} from '../../../../stores/approvalStore';
import { useAgentStoreContext } from '../../../../stores/AgentStoreContext';

/** 每个审批策略的 lucide 图标（对齐 Codex：请求批准=手/替我审批=盾/完全访问=感叹号盾牌）。 */
const ICONS: Record<ApprovalPolicy, LucideIcon> = {
  ask: Hand,
  auto: Shield,
  full: ShieldAlert,
};

/**
 * 审批策略选择器：请求批准 / 替我审批 / 完全访问，与「模式」并列。
 * 每级是预设（沙箱 scope + 确认级别）。当前级别由 sidecar approval 扩展经 setStatus
 * 推送到 approvalStore（切会话/刷新回读）；切换走 agent_set_approval（底层 /approval，不调 LLM）。
 */
export default function ApprovalAction() {
  const { workspace, workspaceReady } = useAgentStoreContext();
  const level = useApprovalStore((s) => s.byWorkspace[workspace] ?? 'auto');

  const onChange = (next: string) => {
    const target = next as ApprovalPolicy;
    useApprovalStore.getState().setLevel(workspace, target);
    void pi.setApproval(workspace, target);
  };

  return (
    <Select
      size="small"
      popupMatchSelectWidth={false}
      disabled={!workspaceReady}
      value={level}
      options={APPROVAL_POLICIES.map((p) => ({ label: APPROVAL_LABELS[p], value: p }))}
      optionRender={(option) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon icon={ICONS[option.value as ApprovalPolicy]} size={14} />
          {APPROVAL_LABELS[option.value as ApprovalPolicy]}
        </span>
      )}
      placeholder="审批"
      prefix={ICONS[level]}
      style={{ width: 'auto', maxWidth: 120 }}
      onChange={onChange}
    />
  );
}
