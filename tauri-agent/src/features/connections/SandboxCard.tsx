import { Button, Flexbox, Icon } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type SandboxStatus, sandboxInstall, sandboxStatus } from '../../lib/pi';

const muted = 'var(--gren-fg-muted, #9aa1ac)';
const border = '1px solid var(--gren-border, rgba(255,255,255,0.08))';

// 代码沙箱（WSL2 + @anthropic-ai/sandbox-runtime）就绪状态 + 一键引导安装。
// 未就绪时受限/无主人会话回退「仅对话」；就绪后可在隔离环境执行（写限 workspace、网络默认禁）。
export function SandboxCard() {
  const [status, setStatus] = useState<SandboxStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const refresh = async () => {
    try {
      setStatus(await sandboxStatus());
    } catch {
      setStatus({ wsl: false, deps: false, ready: false });
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const install = async (step: 'wsl' | 'deps') => {
    setBusy(true);
    setMsg('');
    try {
      setMsg(await sandboxInstall(step));
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const label = !status ? '检测中…' : status.ready ? '就绪' : !status.wsl ? '未装 WSL2' : '待装依赖';
  const color = status?.ready ? cssVar.colorSuccess : status?.wsl ? cssVar.colorWarning : muted;

  return (
    <Flexbox
      data-testid="sandbox-card"
      style={{ border, borderRadius: 10, padding: '11px 13px', marginBlockEnd: 10 }}
      gap={4}
    >
      <Flexbox horizontal align="center" gap={10}>
        <Icon icon={ShieldCheck} size={16} />
        <Flexbox style={{ flex: 1, minWidth: 0 }} gap={1}>
          <Flexbox horizontal align="center" gap={8}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>代码沙箱</span>
            <span style={{ fontSize: 11, color }}>{label}</span>
          </Flexbox>
          <span style={{ fontSize: 11, color: muted }}>
            WSL2 + sandbox-runtime：隔离执行（写限 workspace、网络默认禁）。未就绪时受限会话仅对话。
          </span>
        </Flexbox>
        {status && !status.wsl ? (
          <Button
            size="small"
            loading={busy}
            data-testid="sandbox-install-wsl"
            onClick={() => void install('wsl')}
          >
            安装 WSL2
          </Button>
        ) : status && !status.deps ? (
          <Button
            size="small"
            type="primary"
            loading={busy}
            data-testid="sandbox-install-deps"
            onClick={() => void install('deps')}
          >
            一键安装
          </Button>
        ) : null}
      </Flexbox>
      {msg ? (
        <span
          style={{ fontSize: 11, color: muted, whiteSpace: 'pre-wrap', marginInlineStart: 26 }}
        >
          {msg}
        </span>
      ) : null}
    </Flexbox>
  );
}
