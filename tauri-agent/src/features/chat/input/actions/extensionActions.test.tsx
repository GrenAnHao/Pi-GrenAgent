import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ChatInputProvider, type ChatInputContextValue } from '../ChatInputContext';
import KbAddAction from './KbAddAction';
import GenerateImageAction from './GenerateImageAction';
import SpeakAction from './SpeakAction';

afterEach(() => {
  cleanup();
});

function renderWithCtx(ui: ReactNode) {
  const setValue = vi.fn();
  const ctx: ChatInputContextValue = {
    editor: {} as ChatInputContextValue['editor'],
    empty: true,
    setEmpty: vi.fn(),
    setValue,
    attachments: [],
    addAttachments: vi.fn(),
    removeAttachment: vi.fn(),
    pastedTexts: [],
    addPastedText: vi.fn(),
    removePastedText: vi.fn(),
    isStreaming: false,
    isGenerating: false,
    steering: [],
    followUp: [],
    send: vi.fn(),
    stop: vi.fn(),
  };
  render(<ChatInputProvider value={ctx}>{ui}</ChatInputProvider>);
  return setValue;
}

describe('input extension actions', () => {
  it('KbAddAction prefills a kb_add instruction', () => {
    const setValue = renderWithCtx(<KbAddAction />);
    fireEvent.click(screen.getByRole('button'));
    expect(setValue).toHaveBeenCalledTimes(1);
    expect(setValue.mock.calls[0][0]).toContain('知识库');
  });

  it('GenerateImageAction prefills an image instruction', () => {
    const setValue = renderWithCtx(<GenerateImageAction />);
    fireEvent.click(screen.getByRole('button'));
    expect(setValue.mock.calls[0][0]).toContain('图片');
  });

  it('SpeakAction prefills a speak instruction', () => {
    const setValue = renderWithCtx(<SpeakAction />);
    fireEvent.click(screen.getByRole('button'));
    expect(setValue.mock.calls[0][0]).toContain('朗读');
  });
});
