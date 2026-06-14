import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ThemeProvider } from '@lobehub/ui';
import type { ChatMessage } from '../../stores/agentReducer';

// vi.mock 会被 vitest hoist 到所有 import 之前。
const chatListSpy = vi.fn();
vi.mock('@lobehub/ui/chat', async () => {
  const actual = await vi.importActual<typeof import('@lobehub/ui/chat')>('@lobehub/ui/chat');
  return {
    ...actual,
    ChatList: (props: any) => {
      chatListSpy(props);
      return <div data-testid="mock-chat-list" />;
    },
  };
});

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
  chatListSpy.mockClear();
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
  it('把 store messages 经 group + adapter 后传给 ChatList', () => {
    setMessages(makeFixture());
    render(
      <ThemeProvider themeMode="dark">
        <ChatListView />
      </ThemeProvider>,
    );

    expect(chatListSpy).toHaveBeenCalled();
    const last = chatListSpy.mock.calls.at(-1)![0];
    // group 后：user / assistantGroup(含 tool) / notice = 3 条
    expect(last.data.map((m: any) => m.id)).toEqual(['u1', 'a1', 'n1']);
    expect(last.data.map((m: any) => m.role)).toEqual(['user', 'assistant', 'system']);
    expect(last.data[1].extra.tools).toHaveLength(1);
    expect(last.data[1].extra.tools[0].toolCallId).toBe('tc1');
    expect(last.data[2].extra.kind).toBe('notice');
  });

  it('renderMessages 提供 user / assistant / system 三个分派', () => {
    setMessages(makeFixture());
    render(
      <ThemeProvider themeMode="dark">
        <ChatListView />
      </ThemeProvider>,
    );
    const last = chatListSpy.mock.calls.at(-1)![0];
    expect(typeof last.renderMessages.user).toBe('function');
    expect(typeof last.renderMessages.assistant).toBe('function');
    expect(typeof last.renderMessages.system).toBe('function');
  });

  it('messages 为空时 data 为空数组', () => {
    setMessages([]);
    render(
      <ThemeProvider themeMode="dark">
        <ChatListView />
      </ThemeProvider>,
    );
    const last = chatListSpy.mock.calls.at(-1)![0];
    expect(last.data).toEqual([]);
  });
});
