import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccessParents } from '../lib/channelAccess';
import type { Channel, Message, User, UserRole } from '../types';
import { useChannelReadPosition } from '../hooks/useChannelReadPosition';
import { useUserEngagement } from '../hooks/useUserEngagement';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ScrollToBottomButton } from './ScrollToBottomButton';

interface Props {
  channelId: string;
  channelName: string;
  messages: Message[];
  users: User[];
  channels: Channel[];
  accessParents: AccessParents;
  userRole: UserRole;
  typingUser: string | null;
  highlightMessageId?: string | null;
  highlightTick?: number;
  canWrite: boolean;
  isAdmin?: boolean;
  onRequestDeleteMessage?: (messageId: string) => void;
  onSelectChannel?: (channelId: string) => void;
  onMessageLink?: (channelId: string, messageId: string) => void;
  currentUserId: string;
  onSend: (content: string) => void;
  onTyping: () => void;
  onReadChange?: (lastReadId: string | null, caughtUp: boolean) => void;
}

const SCROLL_AWAY_THRESHOLD = 120;

function isScrolledAwayFromBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight > SCROLL_AWAY_THRESHOLD;
}

export function ChatArea({
  channelId,
  channelName,
  messages,
  users,
  channels,
  accessParents,
  userRole,
  typingUser,
  highlightMessageId,
  highlightTick,
  canWrite,
  isAdmin,
  onRequestDeleteMessage,
  onSelectChannel,
  onMessageLink,
  currentUserId,
  onSend,
  onTyping,
  onReadChange,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const { isEngaged, disengage } = useUserEngagement();

  useEffect(() => {
    disengage();
  }, [channelId, disengage]);

  useEffect(() => () => disengage(), [disengage]);

  const {
    dividerAfterMessageId,
    autoScrollToBottom,
    handleListScroll,
    scrollToLatest,
  } = useChannelReadPosition({
    channelId,
    userId: currentUserId,
    messages,
    listRef,
    highlightMessageId,
    isUserEngaged: isEngaged,
    onReadChange,
  });

  const updateScrollButton = useCallback(() => {
    const el = listRef.current;
    if (!el || messages.length === 0) {
      setShowScrollButton(false);
      return;
    }
    setShowScrollButton(isScrolledAwayFromBottom(el));
  }, [messages.length]);

  const onScroll = useCallback(() => {
    handleListScroll();
    updateScrollButton();
  }, [handleListScroll, updateScrollButton]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    updateScrollButton();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', updateScrollButton);

    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', updateScrollButton);
    };
  }, [onScroll, updateScrollButton]);

  useEffect(() => {
    updateScrollButton();
  }, [messages.length, typingUser, dividerAfterMessageId, updateScrollButton]);

  return (
    <div className="chat-area">
      <div className="chat-area-scroll-wrap">
        <MessageList
          listRef={listRef}
          messages={messages}
          users={users}
          channels={channels}
          typingUser={typingUser}
          highlightMessageId={highlightMessageId}
          highlightTick={highlightTick}
          isAdmin={isAdmin}
          onRequestDeleteMessage={onRequestDeleteMessage}
          onChannelMention={onSelectChannel}
          onMessageLink={onMessageLink}
          currentUserId={currentUserId}
          dividerAfterMessageId={dividerAfterMessageId}
          autoScrollToBottom={autoScrollToBottom}
        />
        <ScrollToBottomButton visible={showScrollButton} onClick={scrollToLatest} />
      </div>
      {canWrite ? (
        <MessageInput
          channelName={channelName}
          users={users}
          channels={channels}
          accessParents={accessParents}
          userRole={userRole}
          onSend={onSend}
          onTyping={onTyping}
        />
      ) : (
        <div className="read-only-notice">This channel is read-only.</div>
      )}
    </div>
  );
}