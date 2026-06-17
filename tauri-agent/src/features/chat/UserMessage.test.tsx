import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@lobehub/ui';
import { UserMessage } from './UserMessage';

afterEach(cleanup);

const renderMsg = (text: string) =>
  render(
    <ThemeProvider>
      <UserMessage text={text} />
    </ThemeProvider>,
  );

describe('UserMessage', () => {
  it('把 pi:attachment 标记渲染成附件卡片, 正文进气泡', () => {
    const text =
      '看这个\n\n<pi:attachment type="file" path="src/config.ts" lines="42">\nconst x = 1\n</pi:attachment>';
    renderMsg(text);
    expect(screen.getByText('看这个')).toBeTruthy();
    expect(screen.getByText('config.ts')).toBeTruthy();
    expect(screen.getByText('42 行')).toBeTruthy();
    // 折叠态不直接显示文件内容
    expect(screen.queryByText('const x = 1')).toBeNull();
  });

  it('无标记的纯文本按原样渲染', () => {
    renderMsg('hello world');
    expect(screen.getByText('hello world')).toBeTruthy();
  });
});
