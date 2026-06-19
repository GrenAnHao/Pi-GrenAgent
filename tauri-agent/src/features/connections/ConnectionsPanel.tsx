import { Button, Flexbox, Icon } from '@lobehub/ui';
import { Modal, Switch } from 'antd';
import { cssVar } from 'antd-style';
import { MessageSquare, Settings2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useWechatStatusStore } from '../../stores/wechatStatusStore';
import { SandboxCard } from './SandboxCard';
import { SettingFieldInput } from '../settings/SettingField';
import { GATEWAY_FIELDS, WECHAT_FIELDS } from '../settings/settingsSchema';
import { useSettingsForm } from '../settings/useSettingsForm';

const muted = 'var(--gren-fg-muted, #9aa1ac)';
const border = '1px solid var(--gren-border, rgba(255,255,255,0.08))';

const isOn = (v: string | undefined): boolean => v === '1' || v?.toLowerCase() === 'true';

// 网络配置项（齿轮弹窗）= 微信字段去掉「启用」开关本身（启用由卡片上的接入开关控制）。
const WECHAT_SETTING_FIELDS = WECHAT_FIELDS.filter((f) => f.key !== 'WECHAT_OC_ENABLE');

const GATEWAY_PLATFORMS = [
  { name: 'Slack', hint: '用 Slack Events API/Bolt 适配器把消息 POST 到网关 /message，回复回 replyUrl。' },
  { name: '飞书 / Feishu', hint: '用飞书机器人回调把消息转发到网关 /message。' },
  { name: 'Telegram', hint: '用 Telegram Bot webhook 把消息转发到网关 /message。' },
];

export function ConnectionsPanel() {
  const { values, setValue, persist, saving, loading, error } = useSettingsForm();
  const wechat = useWechatStatusStore((s) => s.wechat);
  const [qrOpen, setQrOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 网关字段改动后防抖自动落盘（写 runtime-settings.json → sidecar 热重连），无需重启。
  const touchedRef = useRef(false);
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => {
    if (loading || !touchedRef.current) return;
    const timer = window.setTimeout(() => void persistRef.current(), 600);
    return () => window.clearTimeout(timer);
  }, [values.IM_GATEWAY, values.IM_GATEWAY_PORT, values.IM_GATEWAY_TOKEN, loading]);

  const setGatewayField = (key: string, v: string) => {
    touchedRef.current = true;
    setValue(key, v);
  };

  // 登录成功后短暂展示再自动关闭扫码弹窗。
  useEffect(() => {
    if (!qrOpen || !wechat.loggedIn) return;
    const t = window.setTimeout(() => setQrOpen(false), 1200);
    return () => window.clearTimeout(t);
  }, [qrOpen, wechat.loggedIn]);

  const wechatEnabled = isOn(values.WECHAT_OC_ENABLE);
  const wechatLabel = !wechatEnabled
    ? '未启用'
    : wechat.loggedIn
      ? '已登录'
      : wechat.status === 'waiting-scan'
        ? '待扫码'
        : '连接中…';
  const wechatColor = wechat.loggedIn ? cssVar.colorSuccess : wechatEnabled ? cssVar.colorWarning : muted;

  // 接入开关与网络配置：均热更新（persist 写盘 → sidecar watchConfig 重连），无需重启。
  const toggleWechat = async (on: boolean) => {
    setValue('WECHAT_OC_ENABLE', on ? '1' : '0');
    await persist();
    if (on) setQrOpen(true);
  };
  const saveWechatSettings = async () => {
    await persist();
    setSettingsOpen(false);
  };

  return (
    <Flexbox data-testid="connections-panel" style={{ height: '100%', minHeight: 0, overflowY: 'auto' }}>
      <Flexbox
        horizontal
        align="center"
        style={{ padding: '10px 14px', borderBottom: border, flex: '0 0 auto' }}
      >
        <span style={{ fontSize: 13 }}>IM 接入{loading ? ' · 加载中…' : ''}</span>
      </Flexbox>
      {error && <div style={{ padding: '6px 14px', fontSize: 12, color: cssVar.colorError }}>{error}</div>}

      <div style={{ padding: 16, maxWidth: 600 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBlockEnd: 8 }}>平台接入</div>

        {/* 微信（官方 ilink 智能 bot）—— 接入开关弹二维码、齿轮配网络，全部热更 */}
        <Flexbox
          data-testid="wechat-card"
          style={{ border, borderRadius: 10, padding: '11px 13px', marginBlockEnd: 10 }}
          gap={4}
        >
          <Flexbox horizontal align="center" gap={10}>
            <Icon icon={MessageSquare} size={16} />
            <Flexbox style={{ flex: 1, minWidth: 0 }} gap={1}>
              <Flexbox horizontal align="center" gap={8}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>微信</span>
                <span style={{ fontSize: 11, color: wechatColor }}>{wechatLabel}</span>
              </Flexbox>
              <span style={{ fontSize: 11, color: muted }}>官方智能对话 bot（ilink），扫码登录即用，无需公网</span>
            </Flexbox>
            <Button
              size="small"
              icon={<Settings2 size={14} />}
              title="网络配置"
              data-testid="wechat-settings"
              onClick={() => setSettingsOpen(true)}
            />
            <Switch
              size="small"
              checked={wechatEnabled}
              loading={saving}
              data-testid="wechat-enable"
              onChange={(on) => void toggleWechat(on)}
            />
          </Flexbox>
          {wechatEnabled && !wechat.loggedIn ? (
            <button
              type="button"
              data-testid="wechat-show-qr"
              onClick={() => setQrOpen(true)}
              style={{
                alignSelf: 'flex-start',
                marginInlineStart: 26,
                padding: 0,
                border: 'none',
                background: 'transparent',
                color: cssVar.colorPrimary,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {wechat.qrLink ? '显示登录二维码' : '获取二维码中…'}
            </button>
          ) : null}
        </Flexbox>

        {GATEWAY_PLATFORMS.map((p) => (
          <Flexbox key={p.name} gap={3} style={{ border, borderRadius: 10, padding: '11px 13px', marginBlockEnd: 10 }}>
            <Flexbox horizontal align="center" gap={8}>
              <span style={{ fontSize: 13, flex: 1 }}>{p.name}</span>
              <span style={{ fontSize: 11, color: muted }}>未配置</span>
            </Flexbox>
            <span style={{ fontSize: 11, color: muted }}>{p.hint}</span>
          </Flexbox>
        ))}

        {/* 通用 IM 网关：HTTP webhook，供上面这些平台经薄适配器转发。改动自动保存、热生效。 */}
        <div style={{ fontSize: 13, fontWeight: 600, margin: '14px 0 8px' }}>通用 IM 网关（webhook）</div>
        <div style={{ fontSize: 12, color: muted, marginBlockEnd: 10 }}>
          <code>POST /message {'{ text, replyUrl? }'}</code>；改动自动保存、即时生效（无需重启）。
        </div>
        {GATEWAY_FIELDS.map((f) => (
          <SettingFieldInput
            key={f.key}
            field={f}
            value={values[f.key] ?? ''}
            onChange={(v) => setGatewayField(f.key, v)}
            testIdPrefix="conn-field"
          />
        ))}

        {/* 执行沙箱：受限/无主人会话在隔离环境跑命令/代码的就绪状态与一键安装 */}
        <div style={{ fontSize: 13, fontWeight: 600, margin: '14px 0 8px' }}>执行沙箱（WSL2）</div>
        <SandboxCard />
      </div>

      {/* 扫码弹窗 */}
      <Modal
        open={qrOpen}
        title="微信扫码登录"
        footer={null}
        width={380}
        onCancel={() => setQrOpen(false)}
        data-testid="wechat-qr-modal"
      >
        <Flexbox align="center" gap={12} style={{ padding: '8px 0 4px' }}>
          {wechat.loggedIn ? (
            <span style={{ fontSize: 14, color: cssVar.colorSuccess }}>微信已登录，可直接给 bot 发消息遥控 Pi。</span>
          ) : wechat.qrLink ? (
            <>
              <img
                src={wechat.qrLink}
                alt="微信登录二维码"
                width={240}
                height={240}
                style={{ borderRadius: 8, background: '#fff', padding: 6 }}
              />
              <span style={{ fontSize: 12, color: muted }}>用手机微信「扫一扫」登录，二维码 5 分钟内有效（过期自动刷新）。</span>
            </>
          ) : (
            <span style={{ fontSize: 13, color: muted }}>正在获取二维码…（请确保已启用微信接入）</span>
          )}
        </Flexbox>
      </Modal>

      {/* 网络配置弹窗（齿轮） */}
      <Modal
        open={settingsOpen}
        title="微信网络配置"
        okText="保存"
        cancelText="取消"
        onOk={() => void saveWechatSettings()}
        onCancel={() => setSettingsOpen(false)}
        confirmLoading={saving}
        width={460}
        data-testid="wechat-settings-modal"
      >
        <div style={{ fontSize: 12, color: muted, marginBlockEnd: 10 }}>
          留空 bot_token 则启用后扫码登录；改动保存即热更新（无需重启）。
        </div>
        {WECHAT_SETTING_FIELDS.map((f) => (
          <SettingFieldInput
            key={f.key}
            field={f}
            value={values[f.key] ?? ''}
            onChange={(v) => setValue(f.key, v)}
            testIdPrefix="conn-field"
          />
        ))}
      </Modal>
    </Flexbox>
  );
}
