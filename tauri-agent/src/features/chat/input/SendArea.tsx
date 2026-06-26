import { Button, Flexbox, Icon } from '@lobehub/ui';
import { ArrowUp, Square } from 'lucide-react';
import { actionMap, type ActionKey } from './config';
import { useChatInput } from './ChatInputContext';

interface SendAreaProps {
  actions: ActionKey[];
}

export function SendArea({ actions }: SendAreaProps) {
  const { empty, attachments, pastedTexts, isStreaming, isGenerating, send, stop } = useChatInput();
  const canSend = !empty || attachments.length > 0 || pastedTexts.length > 0;
  // run 进行中且无内容 → 停止。有内容时：正在生成 = 引导(steer)；已停笔（收尾/工具间隙）= 跟进(followUp)。
  const showStop = isStreaming && !canSend;

  return (
    <Flexbox horizontal align="center" gap={2}>
      {actions.map((key) => {
        const Render = actionMap[key];
        return <Render key={key} />;
      })}
      <Button
        type="primary"
        shape="circle"
        disabled={!showStop && !canSend}
        title={showStop ? '停止' : isGenerating ? '引导' : isStreaming ? '跟进' : '发送'}
        icon={<Icon icon={showStop ? Square : ArrowUp} size={16} />}
        onClick={() => (showStop ? stop() : send())}
      />
    </Flexbox>
  );
}
