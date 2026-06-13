import { Flexbox } from '@lobehub/ui';
import { useState } from 'react';
import { useSettingsForm } from './useSettingsForm';
import { SETTINGS_SCHEMA } from './settingsSchema';
import { SettingFieldInput } from './SettingField';

const muted = 'var(--gren-fg-muted, #9aa1ac)';
const border = '1px solid var(--gren-border, rgba(255,255,255,0.08))';

export function SettingsPanel() {
  const { values, setValue, save, saving, loading, error } = useSettingsForm();
  const [activeCat, setActiveCat] = useState(SETTINGS_SCHEMA[0].id);
  const cat = SETTINGS_SCHEMA.find((c) => c.id === activeCat) ?? SETTINGS_SCHEMA[0];

  return (
    <Flexbox data-testid="settings-panel" style={{ height: '100%', minHeight: 0 }}>
      <Flexbox
        horizontal
        align="center"
        justify="space-between"
        style={{ padding: '10px 14px', borderBottom: border, flex: '0 0 auto' }}
      >
        <span style={{ fontSize: 13 }}>
          {loading ? '加载中…' : '设置（保存后自动重启 sidecar 生效）'}
        </span>
        <button
          data-testid="set-save"
          onClick={() => void save()}
          disabled={saving}
          style={{
            padding: '4px 14px',
            borderRadius: 6,
            border,
            cursor: 'pointer',
            background: 'var(--gren-rail-active, rgba(255,255,255,0.08))',
            color: 'inherit',
            fontSize: 12,
          }}
        >
          {saving ? '保存中…' : '保存并重启'}
        </button>
      </Flexbox>
      {error && <div style={{ padding: '6px 14px', fontSize: 12, color: '#f87171' }}>{error}</div>}
      <Flexbox horizontal flex={1} style={{ minHeight: 0 }}>
        <Flexbox style={{ width: 160, flex: '0 0 auto', borderRight: border, overflowY: 'auto' }}>
          {SETTINGS_SCHEMA.map((c) => (
            <button
              key={c.id}
              data-testid={`set-cat-${c.id}`}
              onClick={() => setActiveCat(c.id)}
              style={{
                padding: '8px 14px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                background:
                  c.id === activeCat ? 'var(--gren-rail-active, rgba(255,255,255,0.08))' : 'transparent',
                color: c.id === activeCat ? 'var(--gren-fg, inherit)' : muted,
                fontSize: 13,
              }}
            >
              {c.title}
            </button>
          ))}
        </Flexbox>
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 16, maxWidth: 560 }}>
          {cat.fields.map((f) => (
            <SettingFieldInput
              key={f.key}
              field={f}
              value={values[f.key] ?? ''}
              onChange={(v) => setValue(f.key, v)}
            />
          ))}
        </div>
      </Flexbox>
    </Flexbox>
  );
}
