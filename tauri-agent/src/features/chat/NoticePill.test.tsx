import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NoticePill } from './NoticePill';

afterEach(() => {
  cleanup();
});

describe('NoticePill', () => {
  it('shows the knowledge-rag title', () => {
    render(<NoticePill customType="knowledge-rag" content="# KB" />);
    expect(screen.getByTestId('notice-pill').textContent).toContain('已注入知识库上下文');
  });

  it('shows the long-term-memory title', () => {
    render(<NoticePill customType="long-term-memory" content="# Mem" />);
    expect(screen.getByTestId('notice-pill').textContent).toContain('已注入长期记忆');
  });

  it('shows self-evolve dream start title', () => {
    render(<NoticePill customType="self-evolve-dream-start" content="- running" />);
    expect(screen.getByTestId('notice-pill').textContent).toContain('Dream 已启动');
  });

  it('shows self-evolve auto done title', () => {
    render(<NoticePill customType="self-evolve-dream-done" content="- done" />);
    expect(screen.getByTestId('notice-pill').textContent).toContain('Auto Dream 已完成');
  });

  it('falls back to a generic title for unknown customType', () => {
    render(<NoticePill customType="other" content="x" />);
    expect(screen.getByTestId('notice-pill').textContent).toContain('已注入上下文');
  });

  it('折叠头显示记忆条数（剥离重复大标题后数列表项）', () => {
    const content = '# Relevant long-term memory (auto-recalled)\n\n- a\n- b\n- c';
    render(<NoticePill customType="long-term-memory" content={content} />);
    const el = screen.getByTestId('notice-pill');
    expect(el.textContent).toContain('已注入长期记忆');
    expect(el.textContent).toContain('3 条');
  });
});
