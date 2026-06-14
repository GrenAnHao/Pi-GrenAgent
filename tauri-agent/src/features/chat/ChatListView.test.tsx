import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ThemeProvider } from '@lobehub/ui';
import type { ChatMessage } from '../../stores/agentReducer';

// AgentStoreContext mock：直通假 useAgentStore（zustand-like 选择器）。
const mockState: { messages: ChatMessage[]; isStreaming: boolean } = {
  messages: [],
  isStreaming: false,
};
vi.mock('../../stores/AgentStoreContext', () => {
  return {
    useAgentStore: () => ({
      useStore: (selector: any) => selector(mockState),
    }),
    useAgentStoreContext: () => ({ workspace: '/test', store: {} }),
    AgentStoreProvider: ({ children }: any) => <>{children}</>,
  };
});

import { ChatListView } from './ChatListView';

afterEach(() => {
  cleanup();
  mockState.messages = [];
  mockState.isStreaming = false;
});

function setMessages(msgs: ChatMessage[]) {
  mockState.messages = msgs;
}

function makeFixture(): ChatMessage[] {
  return [
    { kind: 'user', id: 'u1', text: 'hi' } as ChatMessage,
    {
      kind: 'assistant',
      id: 'a1',
      text: 'ok',
      thinking: '',
      streaming: false,
    } as ChatMessage,
    {
      kind: 'tool',
      id: 't1',
      toolCallId: 'tc1',
      toolName: 'grep',
      args: {},
      result: {},
      status: 'done',
    } as ChatMessage,
    { kind: 'notice', id: 'n1', customType: 'knowledge-rag', content: '已注入 3 条' } as ChatMessage,
  ];
}

describe('ChatListView', { timeout: 30_000 }, () => {
  it('渲染自研滚动容器（无 lobe ChatList 包装）', () => {
    setMessages(makeFixture());
    render(
      <ThemeProvider themeMode="dark">
        <ChatListView />
      </ThemeProvider>,
    );

    const scroll = document.querySelector('[data-testid="chat-scroll"]');
    expect(scroll).not.toBeNull();
    // 渲染管线连通：用户气泡文本出现在容器内。
    expect(scroll!.textContent).toContain('hi');
  });

  it('messages 为空时仍渲染滚动容器', () => {
    setMessages([]);
    render(
      <ThemeProvider themeMode="dark">
        <ChatListView />
      </ThemeProvider>,
    );
    expect(document.querySelector('[data-testid="chat-scroll"]')).not.toBeNull();
  });
});
