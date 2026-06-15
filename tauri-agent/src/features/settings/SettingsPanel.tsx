import { Flexbox, Icon } from '@lobehub/ui';
import { createStyles } from 'antd-style';
import { useState } from 'react';
import { fieldEffect, SETTINGS_SCHEMA, SETTING_GROUPS, type SettingCategory } from './settingsSchema';
import { SettingCard } from './SettingCard';
import { SettingFieldInput } from './SettingField';
import { useSettingsForm } from './useSettingsForm';

const useStyles = createStyles(({ css, token }) => ({
  root: css`
    height: 100%;
    min-height: 0;
  `,
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-block-end: 1px solid ${token.colorBorderSecondary};
    flex: 0 0 auto;
  `,
  hint: css`
    font-size: 13px;
    color: ${token.colorTextSecondary};
  `,
  saveBtn: css`
    padding: 4px 14px;
    border: 1px solid ${token.colorBorder};
    border-radius: ${token.borderRadius}px;
    cursor: pointer;
    background: ${token.colorFillSecondary};
    color: ${token.colorText};
    font-size: 12px;
    &:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  `,
  body: css`
    display: flex;
    flex: 1;
    min-height: 0;
  `,
  nav: css`
    width: 220px;
    flex: 0 0 auto;
    border-inline-end: 1px solid ${token.colorBorderSecondary};
    overflow-y: auto;
    padding: 12px 8px;
  `,
  groupTitle: css`
    padding: 12px 12px 4px;
    font-size: 12px;
    color: ${token.colorTextDescription};
  `,
  navItem: css`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-radius: ${token.borderRadius}px;
    cursor: pointer;
    text-align: start;
    background: transparent;
    color: ${token.colorTextSecondary};
    font-size: 13px;
    &:hover {
      background: ${token.colorFillTertiary};
    }
  `,
  navItemActive: css`
    background: ${token.colorFillSecondary};
    color: ${token.colorText};
  `,
  content: css`
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 20px 24px;
  `,
  pageTitle: css`
    font-size: 18px;
    font-weight: 600;
    color: ${token.colorText};
    margin-block-end: 16px;
  `,
  inner: css`
    max-width: 720px;
  `,
  errorBar: css`
    padding: 6px 16px;
    font-size: 12px;
    color: #f87171;
  `,
}));

export function SettingsPanel() {
  const { styles, cx } = useStyles();
  const { values, setValue, save, saving, loading, error } = useSettingsForm();
  const [activeId, setActiveId] = useState(SETTINGS_SCHEMA[0].id);
  const cat: SettingCategory = SETTINGS_SCHEMA.find((c) => c.id === activeId) ?? SETTINGS_SCHEMA[0];
  const sections = cat.sections ?? [{ title: '', fields: cat.fields ?? [] }];
  // 是否存在需重启才生效的设置项（当前 schema 全为即时/热更新，故默认无重启按钮）。
  const hasRestart = SETTINGS_SCHEMA.some((c) =>
    (c.sections?.flatMap((s) => s.fields) ?? c.fields ?? []).some((f) => fieldEffect(f) === 'restart'),
  );

  return (
    <Flexbox className={styles.root} data-testid="settings-panel">
      <div className={styles.header}>
        <span className={styles.hint}>{loading ? '加载中…' : '改动即时保存生效，无需重启'}</span>
        {hasRestart ? (
          <button data-testid="set-save" onClick={() => void save()} disabled={saving} className={styles.saveBtn}>
            {saving ? '重启中…' : '重启生效'}
          </button>
        ) : null}
      </div>
      {error ? <div className={styles.errorBar}>{error}</div> : null}
      <div className={styles.body}>
        <nav className={styles.nav}>
          {SETTING_GROUPS.map((g) => {
            const items = SETTINGS_SCHEMA.filter((c) => c.group === g);
            if (!items.length) return null;
            return (
              <div key={g}>
                <div className={styles.groupTitle}>{g}</div>
                {items.map((c) => (
                  <button
                    key={c.id}
                    data-testid={`set-cat-${c.id}`}
                    onClick={() => setActiveId(c.id)}
                    className={cx(styles.navItem, c.id === activeId && styles.navItemActive)}
                  >
                    <Icon icon={c.icon} size={16} />
                    {c.title}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className={styles.content}>
          <div className={styles.inner}>
            <div className={styles.pageTitle}>{cat.title}</div>
            {sections.map((sec, i) => (
              <SettingCard key={sec.title || i} title={sec.title || undefined}>
                {sec.fields.map((f) => (
                  <SettingFieldInput
                    key={f.key}
                    field={f}
                    value={values[f.key] ?? ''}
                    onChange={(v) => setValue(f.key, v)}
                  />
                ))}
              </SettingCard>
            ))}
          </div>
        </div>
      </div>
    </Flexbox>
  );
}
