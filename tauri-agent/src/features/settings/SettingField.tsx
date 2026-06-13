import { Flexbox } from '@lobehub/ui';
import type { ChangeEvent } from 'react';
import type { SettingField } from './settingsSchema';

const muted = 'var(--gren-fg-muted, #9aa1ac)';
const border = '1px solid var(--gren-border, rgba(255,255,255,0.08))';

interface Props {
  field: SettingField;
  value: string;
  onChange: (v: string) => void;
  /** testid 前缀，默认 set-field；连接面板用 conn-field。 */
  testIdPrefix?: string;
}

export function SettingFieldInput({ field, value, onChange, testIdPrefix = 'set-field' }: Props) {
  const testId = `${testIdPrefix}-${field.key}`;

  if (field.type === 'boolean') {
    const on = value === '1' || value.toLowerCase() === 'true';
    return (
      <Flexbox horizontal align="center" gap={10} style={{ marginBlockEnd: 12 }}>
        <button
          data-testid={testId}
          type="button"
          role="switch"
          aria-checked={on}
          title={on ? '已开启' : '已关闭'}
          onClick={() => onChange(on ? '0' : '1')}
          style={{
            position: 'relative',
            width: 34,
            height: 20,
            flex: '0 0 auto',
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            background: on ? 'var(--gren-acc, #4c8dff)' : 'var(--gren-bg-3, #3a3f47)',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              insetInlineStart: on ? 16 : 2,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#fff',
              transition: 'inset-inline-start 0.15s ease',
            }}
          />
        </button>
        <span style={{ fontSize: 12, color: muted }}>{field.label}</span>
      </Flexbox>
    );
  }

  return (
    <Flexbox gap={4} style={{ marginBlockEnd: 12 }}>
      <span style={{ fontSize: 12, color: muted }}>{field.label}</span>
      <input
        data-testid={testId}
        value={value ?? ''}
        placeholder={field.placeholder}
        type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '6px 8px',
          borderRadius: 6,
          border,
          background: 'transparent',
          color: 'inherit',
          fontSize: 13,
        }}
      />
    </Flexbox>
  );
}
