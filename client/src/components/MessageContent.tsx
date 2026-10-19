import { parseMessageMarkup, type MarkupContext } from '../lib/markup';

interface Props {
  content: string;
  users?: MarkupContext['users'];
  channels?: MarkupContext['channels'];
  onChannelMention?: MarkupContext['onChannelMention'];
  onMessageLink?: MarkupContext['onMessageLink'];
}

export function MessageContent({ content, users, channels, onChannelMention, onMessageLink }: Props) {
  return (
    <>
      {parseMessageMarkup(content, { users, channels, onChannelMention, onMessageLink })}
    </>
  );
}