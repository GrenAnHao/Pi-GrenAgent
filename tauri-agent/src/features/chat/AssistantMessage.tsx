import { Suspense, lazy, memo } from 'react';
import { ChatItemShell } from './ChatItemShell';
import { Thinking } from './Thinking';
import { LazyMarkdown } from './LazyMarkdown';

const ToolExecution = lazy(() =>
  import('../tools/ToolExecution').then((m) => ({ default: m.ToolExecution })),
);

/** Tool calls associated with an assistant turn (shape matches groupMessages' ToolDisplay). */
export interface AssistantToolItem {
  id: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
  result: unknown;
  status: 'running' | 'done' | 'error';
}

interface AssistantMessageProps {
  text: string;
  thinking: string;
  streaming: boolean;
  thinkingDuration?: number;
  /** Optional inline tool calls rendered beneath the answer (grouped-message rendering). */
  tools?: AssistantToolItem[];
}

/**
 * 助手消息：自研无头像外壳 + 垂直 ContentBlock 栈，顺序固定 Reasoning → Markdown → Tools。
 * 对齐 lobehub：去掉 lobe `ChatItem variant=docs`，正文直接走 `LazyMarkdown`。
 */
function AssistantMessageInner({
  text,
  thinking,
  streaming,
  thinkingDuration,
  tools,
}: AssistantMessageProps) {
  const reasoning = streaming && !text;

  return (
    <ChatItemShell placement="left">
      {thinking ? (
        <Thinking content={thinking} thinking={reasoning} duration={thinkingDuration} />
      ) : null}
      {text ? (
        <LazyMarkdown variant="chat" fontSize={14} animated={streaming}>
          {text}
        </LazyMarkdown>
      ) : null}
      {tools && tools.length > 0 ? (
        <Suspense fallback={null}>
          {tools.map((t) => (
            <ToolExecution
              key={t.id}
              toolName={t.toolName}
              toolCallId={t.toolCallId}
              args={t.args}
              result={t.result}
              status={t.status}
            />
          ))}
        </Suspense>
      ) : null}
    </ChatItemShell>
  );
}

export const AssistantMessage = memo(AssistantMessageInner);
