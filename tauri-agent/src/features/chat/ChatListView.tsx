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
          // lobe-ui renderMessages 是 FC<ChatMessage & { editableContent }>，单 props 参数。
          user: (props: any) => <UserMessage key={props.id} text={props.content} />,
          assistant: (props: any) => {
            const extra = props.extra as AssistantGroupExtra | undefined;
            return (
              <AssistantMessage
                key={props.id}
                text={props.content}
                thinking={extra?.thinking ?? ''}
                streaming={extra?.streaming ?? false}
                thinkingDuration={extra?.thinkingDuration}
                tools={extra && extra.tools.length > 0 ? extra.tools : undefined}
              />
            );
          },
          system: (props: any) => {
            const extra = props.extra as NoticeExtra | OrphanToolExtra | undefined;
            if (extra?.kind === 'notice') {
              return (
                <NoticePill key={props.id} customType={extra.customType} content={extra.content} />
              );
            }
            return null;
          },
        } as any
      }
    />
  );
}
