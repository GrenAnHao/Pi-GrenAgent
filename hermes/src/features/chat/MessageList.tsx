import { useMessageStore } from '../../store';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';

export function MessageList() {
  const messages = useMessageStore((state) => state.messages);
  const streamingMessage = useMessageStore((state) => state.streamingMessage);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {messages.map((msg, idx) => (
        msg.role === 'user' ? (
          <UserMessage key={idx} message={msg} />
        ) : (
          <AssistantMessage key={idx} message={msg} />
        )
      ))}

      {streamingMessage && (
        <AssistantMessage message={streamingMessage as any} />
      )}
    </div>
  );
}
