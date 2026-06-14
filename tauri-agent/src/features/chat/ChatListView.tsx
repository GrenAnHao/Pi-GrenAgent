import { ChatList } from '@lobehub/ui/chat';
import { useMemo } from 'react';
import { useAgentStore } from '../../stores/AgentStoreContext';
import { useThrottledValue } from '../../hooks/useThrottledValue';
import { groupMessages } from './groupMessages';
import {
  toLobeMessages,
  type AssistantGroupExtra,
  type NoticeExtra,
  type OrphanToolExtra,
} from './messageAdapter';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { NoticePill } from './NoticePill';

interface ChatListViewProps {
  bottomOffset?: number;
}

export function ChatListView({ bottomOffset = 88 }: ChatListViewProps) {
  const { useStore } = useAgentStore();
  const messages = useStore((s) => s.messages);
  const isStreaming = useStore((s) => s.isStreaming);

  // streaming 中 100ms 节流，避免每 token 触发 ChatList 重算（详见 useThrottledValue 契约）。
  const throttledMessages = useThrottledValue(messages, 100, { enabled: isStreaming });
  const lobeMessages = useMemo(
    () => toLobeMessages(groupMessages(throttledMessages)),
    [throttledMessages],
  );

  return (
    <ChatList
      data={lobeMessages as any}
      variant="bubble"
      style={{ position: 'absolute', inset: 0, paddingBottom: bottomOffset }}
      renderMessages={
        {
          user: (_default: unknown, item: any) => (
            <UserMessage key={item.id} text={item.content} />
          ),
          assistant: (_default: unknown, item: any) => {
            const extra = item.extra as AssistantGroupExtra;
            return (
              <AssistantMessage
                key={item.id}
                text={item.content}
                thinking={extra.thinking}
                streaming={extra.streaming}
                thinkingDuration={extra.thinkingDuration}
                tools={extra.tools.length > 0 ? extra.tools : undefined}
              />
            );
          },
          system: (_default: unknown, item: any) => {
            const extra = item.extra as NoticeExtra | OrphanToolExtra;
            if (extra?.kind === 'notice') {
              return (
                <NoticePill key={item.id} customType={extra.customType} content={extra.content} />
              );
            }
            return null;
          },
        } as any
      }
    />
  );
}
