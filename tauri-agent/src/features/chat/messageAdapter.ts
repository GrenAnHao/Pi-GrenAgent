import type { ChatMessage as LobeChatMessage } from '@lobehub/ui/chat';
import type { DisplayMessage } from './groupMessages';

export interface AssistantGroupExtra {
  kind: 'assistantGroup';
  thinking: string;
  streaming: boolean;
  thinkingDuration?: number;
  tools: Array<{
    id: string;
    toolCallId: string;
    toolName: string;
    args: unknown;
    result: unknown;
    status: 'running' | 'done' | 'error';
  }>;
}

export interface NoticeExtra {
  kind: 'notice';
  customType: string;
  content: string;
}

export interface OrphanToolExtra {
  kind: 'orphanTool';
  toolCallId: string;
  toolName: string;
  args: unknown;
  result: unknown;
  status: 'running' | 'done' | 'error';
}

export type ChatExtra = AssistantGroupExtra | NoticeExtra | OrphanToolExtra;

const NOW = () => Date.now();

// lobe-ui ChatList.ChatMessage extends BaseDataModel — `meta` / `createAt` / `updateAt` 是必需字段。
// 即使 ChatList showAvatar=false，meta 仍要存在，ChatList 内部会把 meta 透给 ChatItem 的 `avatar` prop。
const USER_META = { avatar: '🧑', title: 'You' };
const ASSISTANT_META = { avatar: '🤖', title: 'Assistant' };
const SYSTEM_META = { avatar: '✨', title: 'System' };

export function toLobeMessages(messages: DisplayMessage[]): LobeChatMessage[] {
  const ts = NOW();
  return messages.map((msg): LobeChatMessage => {
    const base = { createAt: ts, updateAt: ts };
    switch (msg.kind) {
      case 'user':
        return {
          ...base,
          id: msg.id,
          role: 'user',
          content: msg.text,
          meta: USER_META,
        } as LobeChatMessage;
      case 'assistantGroup':
        return {
          ...base,
          id: msg.id,
          role: 'assistant',
          content: msg.text,
          meta: ASSISTANT_META,
          extra: {
            kind: 'assistantGroup',
            thinking: msg.thinking,
            streaming: msg.streaming,
            thinkingDuration: msg.thinkingDuration,
            tools: msg.tools,
          } satisfies AssistantGroupExtra,
        } as LobeChatMessage;
      case 'notice':
        return {
          ...base,
          id: msg.id,
          role: 'system',
          content: msg.content,
          meta: SYSTEM_META,
          extra: {
            kind: 'notice',
            customType: msg.customType,
            content: msg.content,
          } satisfies NoticeExtra,
        } as LobeChatMessage;
      case 'tool':
        return {
          ...base,
          id: msg.id,
          role: 'system',
          content: '',
          meta: SYSTEM_META,
          extra: {
            kind: 'orphanTool',
            toolCallId: msg.toolCallId,
            toolName: msg.toolName,
            args: msg.args,
            result: msg.result,
            status: msg.status,
          } satisfies OrphanToolExtra,
        } as LobeChatMessage;
    }
  });
}
