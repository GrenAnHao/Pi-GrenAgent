import { Flexbox } from '@lobehub/ui';
import { Select, Switch, Tooltip } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { Brain } from 'lucide-react';
import { ModelSelectField } from '../settings/ModelSelectField';
import { userConfiguredCodeIntel } from './codeIntelYield';

const styles = createStaticStyles(({ css }) => ({
  hero: css`
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-block-end: 18px;
  `,
  heroIcon: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    border-radius: 10px;
    background: ${cssVar.colorFillTertiary};
    color: ${cssVar.colorText};
  `,
  heroTitle: css`
    font-size: 17px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  heroDesc: css`
    margin-block-start: 3px;
    font-size: 12.5px;
    line-height: 1.55;
    color: ${cssVar.colorTextSecondary};
  `,
  card: css`
    margin-block-end: 14px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    background: ${cssVar.colorBgContainer};
    overflow: hidden;
  `,
  cardHead: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 11px 16px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  cardTitle: css`
    font-size: 13px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  cardBody: css`
    padding: 14px 16px;
  `,
  row: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  `,
  rowLabel: css`
    font-size: 13px;
    color: ${cssVar.colorText};
  `,
  rowDesc: css`
    margin-block-start: 2px;
    font-size: 11.5px;
    line-height: 1.5;
    color: ${cssVar.colorTextTertiary};
  `,
  divided: css`
    margin-block-start: 14px;
    padding-block-start: 14px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  hint: css`
    font-size: 11.5px;
    line-height: 1.6;
    color: ${cssVar.colorTextTertiary};
  `,
  engineBadge: css`
    padding: 1px 9px;
    border-radius: 999px;
    background: ${cssVar.colorWarningBg};
    color: ${cssVar.colorWarning};
    font-size: 11px;
    white-space: nowrap;
    cursor: default;
  `,
}));

interface CodeIntelTabProps {
  values: Record<string, string>;
  setValue: (key: string, value: string) => void;
  /** 标记有改动（触发自动存盘，热更生效）。 */
  onChange: () => void;
  /** 需要 sidecar 重载扩展才生效的改动（如 explore_context 开关）：触发 session.reload()。 */
  onReload?: () => void;
  /** 当前已连 MCP 工具名（用于让位徽标，来自 tools cache 汇总）。 */
  knownToolNames: string[];
}

const ENGINE_OPTIONS = [
  { value: 'codebase-memory', label: 'codebase-memory（内置，默认）' },
  { value: 'off', label: '关闭' },
];

export function CodeIntelTab({ values, setValue, onChange, onReload, knownToolNames }: CodeIntelTabProps) {
  // 旧/未知引擎值（如已移除的 codegraph/gitnexus）回落 codebase-memory，避免选择器显示空。
  const rawEngine = values.CODE_INTEL ?? 'codebase-memory';
  const engine = ENGINE_OPTIONS.some((o) => o.value === rawEngine) ? rawEngine : 'codebase-memory';
  const autoInit = (values.CODE_INTEL_AUTO_INIT ?? '1') !== '0';
  const explorerOn = (values.CODE_INTEL_EXPLORER ?? '1') !== '0';
  const yielded = userConfiguredCodeIntel(values.MCP_SERVERS ?? '', knownToolNames);

  const setEngine = (v: string) => {
    setValue('CODE_INTEL', v);
    onChange();
  };
  const toggleAutoInit = (on: boolean) => {
    setValue('CODE_INTEL_AUTO_INIT', on ? '1' : '0');
    onChange();
  };
  const toggleExplorer = (on: boolean) => {
    setValue('CODE_INTEL_EXPLORER', on ? '1' : '0');
    onChange();
    // 注册/注销 explore_context 需重跑扩展工厂 → 触发 session.reload() 热更，无需重启。
    onReload?.();
  };
  const setExplorerModel = (v: string) => {
    setValue('CODE_INTEL_EXPLORER_MODEL', v);
    onChange();
  };

  return (
    <div data-testid="code-intel-tab">
      <div className={styles.hero}>
        <span className={styles.heroIcon}>
          <Brain size={19} />
        </span>
        <div>
          <div className={styles.heroTitle}>代码智能</div>
          <div className={styles.heroDesc}>
            基于 codebase-memory 的离线代码图谱：为 agent 提供符号检索、调用关系与只读探索能力，索引与查询全部本地完成。
          </div>
        </div>
      </div>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>引擎</span>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.row}>
            <div>
              <div className={styles.rowLabel}>代码图谱引擎</div>
              <div className={styles.rowDesc}>codebase-memory 为内置离线引擎；切换经热更新生效</div>
            </div>
            <Flexbox horizontal align="center" gap={8}>
              {yielded ? (
                <Tooltip title="检测到你已自配 codebase-memory MCP，内置引擎自动让位">
                  <span className={styles.engineBadge} data-testid="code-intel-badge">
                    内置让位
                  </span>
                </Tooltip>
              ) : null}
              <Select
                data-testid="code-intel-engine"
                size="small"
                value={engine}
                options={ENGINE_OPTIONS}
                style={{ minWidth: 188 }}
                onChange={setEngine}
              />
            </Flexbox>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>索引</span>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.row}>
            <div>
              <div className={styles.rowLabel}>打开 workspace 时自动初始化</div>
              <div className={styles.rowDesc}>未索引时后台自动 init（CODE_INTEL_AUTO_INIT）</div>
            </div>
            <Switch size="small" checked={autoInit} data-testid="code-intel-autoinit" onChange={toggleAutoInit} />
          </div>
          <div className={styles.divided}>
            <div className={styles.hint}>
              索引状态与「初始化 / 增量同步 / 重建」已移到对话框上方的「索引」入口，点开即可查看与操作。
            </div>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>探索子代理</span>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.row}>
            <div>
              <div className={styles.rowLabel}>启用 explore_context</div>
              <div className={styles.rowDesc}>只读探索子代理；关闭后该工具不再注册（即时生效，无需重启）</div>
            </div>
            <Switch size="small" checked={explorerOn} data-testid="code-intel-explorer" onChange={toggleExplorer} />
          </div>
          <div className={`${styles.row} ${styles.divided}`}>
            <div>
              <div className={styles.rowLabel}>探索模型</div>
              <div className={styles.rowDesc}>留空＝子代理便宜模型（SUBAGENT_MODEL_CHEAP）</div>
            </div>
            <ModelSelectField
              value={values.CODE_INTEL_EXPLORER_MODEL ?? ''}
              placeholder="如 deepseek/deepseek-chat"
              testId="code-intel-explorer-model"
              onChange={setExplorerModel}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
