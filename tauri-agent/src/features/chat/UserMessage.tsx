import { memo } from 'react';
import { ChatItem } from '@lobehub/ui/chat';

interface UserMessageProps {
  text: string;
}

function UserMessageInner({ text }: UserMessageProps) {
  return (
    <ChatItem
      placement="right"
      showAvatar={false}
      variant="bubble"
      fontSize={14}
      message={text}
      avatar={{ avatar: '🧑', title: 'You' }}
    />
  );
}

export const UserMessage = memo(UserMessageInner);
