import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { MESSAGE_JUMP_HIGHLIGHT_MS } from '../lib/constants';
import type { Channel, Message, User } from '../types';
import { MessageItem } from './MessageItem';
import { UnreadDivider } from './UnreadDivider';

interface Props {
  messages: Message[];
  users: User[];
  channels?: Pick<Channel, 'id' | 'name'>[];
  typingUser: string | null;
  highlightMessageId?: string | null;
  highlightTick?: number;
  isAdmin?: boolean;
  onRequestDeleteMessage?: (messageId: string) => void;
  onChannelMention?: (channelId: string) => void;
  onMessageLink?: (channelId: string, messageId: string) => void;
  currentUserId?: string;
  listRef?: RefObject<HTMLDivElement | null>;
  dividerAfterMessageId?: string | null;
  autoScrollToBottom?: boolean;
}

const GROUP_WINDOW_MS = 300000;


function clusterMessages(messages: Message[], pinMessageId?: string | null): Message[][] {
  const clusters: Message[][] = [];
  let current: Message[] = [];

  for (const msg of messages) {
    const prev = current[current.length - 1];
    const pinBreak = pinMessageId && msg.id === pinMessageId && current.length > 0;
    const startsNewCluster =
      !prev ||
      pinBreak ||
      prev.userId !== msg.userId ||
      new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() > GROUP_WINDOW_MS;

    if (startsNewCluster) {
      if (current.length > 0) clusters.push(current);
      current = [msg];
    } else {
      current.push(msg);
    }
  }

  if (current.length > 0) clusters.push(current);
  return clusters;
}

export function MessageList({
  messages,
  users,
  channels,
  typingUser,
  highlightMessageId,
  highlightTick = 0,
  isAdmin,
  onRequestDeleteMessage,
  onChannelMention,
  onMessageLink,
  currentUserId,
  listRef,
  dividerAfterMessageId,
  autoScrollToBottom = true,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(messages.length);
  const litElementRef = useRef<HTMLElement | null>(null);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const clusters = useMemo(
    () => clusterMessages(messages, highlightMessageId),
    [messages, highlightMessageId],
  );

  useLayoutEffect(() => {
    let timeout: number | undefined;
    let interval: number | undefined;
    let frame = 0;

    const clearLit = () => {
      litElementRef.current?.classList.remove('message-group--lit');
      litElementRef.current = null;
    };

    if (!highlightMessageId) {
      clearLit();
      return;
    }

    const targetId = highlightMessageId;
    let attempts = 0;

    const applyLit = (scroll = false) => {
      const el = document.getElementById(`message-${targetId}`);
      if (!el) return false;
      if (litElementRef.current && litElementRef.current !== el) {
        litElementRef.current.classList.remove('message-group--lit');
      }
      if (!el.classList.contains('message-group--lit')) {
        el.classList.add('message-group--lit');
      }
      litElementRef.current = el;
      if (scroll) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    };

    const tryApply = () => {
      if (applyLit(true) || attempts >= 16) return;
      attempts += 1;
      frame = requestAnimationFrame(tryApply);
    };

    tryApply();

    interval = window.setInterval(() => applyLit(false), 400);
    timeout = window.setTimeout(() => {
      if (interval) window.clearInterval(interval);
      clearLit();
    }, MESSAGE_JUMP_HIGHLIGHT_MS);

    return () => {
      cancelAnimationFrame(frame);
      if (interval) window.clearInterval(interval);
      if (timeout) window.clearTimeout(timeout);
      clearLit();
    };
  }, [highlightMessageId, highlightTick]);

  useEffect(() => {
    if (highlightMessageId) {
      prevMessageCountRef.current = messages.length;
      return;
    }
    if (autoScrollToBottom && messages.length > prevMessageCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, typingUser, highlightMessageId, autoScrollToBottom]);

  if (messages.length === 0) {
    return (
      <div className="message-list" ref={listRef}>
        <div className="empty-state">No messages yet. Start the conversation.</div>
        <div ref={bottomRef} />
      </div>
    );
  }

  return (
    <div className="message-list" ref={listRef}>
      {clusters.map((cluster) => (
        <div className="message-cluster" key={cluster[0].id}>
          {cluster.map((msg, i) => (
            <Fragment key={msg.id}>
              <MessageItem
                message={msg}
                user={userMap.get(msg.userId)}
                users={users}
                channels={channels}
                showHeader={i === 0}
                isAdmin={isAdmin}
                onRequestDelete={onRequestDeleteMessage}
                onChannelMention={onChannelMention}
                onMessageLink={onMessageLink}
                currentUserId={currentUserId}
              />
              {dividerAfterMessageId === msg.id && <UnreadDivider />}
            </Fragment>
          ))}
        </div>
      ))}
      {typingUser && <div className="typing-indicator">{typingUser} is typing…</div>}
      <div ref={bottomRef} />
    </div>
  );
}