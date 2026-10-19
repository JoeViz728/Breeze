import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  READ_ANCHOR_STALE_MS,
  READ_VISIBLE_MS,
  READ_VISIBLE_RATIO,
} from '../lib/constants';
import {
  findReadAnchorIndex,
  getLastReadMessageId,
  getUnreadMessageIds,
  hasUnreadMessages,
  isMessageAfterReadAnchor,
  setLastReadMessageId,
} from '../lib/readPosition';
import type { Message } from '../types';

const SCROLL_BOTTOM_THRESHOLD = 120;

function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_BOTTOM_THRESHOLD;
}

function scrollToMessage(messageId: string, behavior: ScrollBehavior = 'auto') {
  document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior, block: 'start' });
}

function scrollToBottom(el: HTMLElement, behavior: ScrollBehavior = 'auto') {
  el.scrollTo({ top: el.scrollHeight, behavior });
}

interface Options {
  channelId: string;
  userId: string;
  messages: Message[];
  listRef: RefObject<HTMLDivElement | null>;
  highlightMessageId?: string | null;
  isUserEngaged?: boolean;
  onReadChange?: (lastReadId: string | null, caughtUp: boolean) => void;
}

export function useChannelReadPosition({
  channelId,
  userId,
  messages,
  listRef,
  highlightMessageId,
  isUserEngaged = false,
  onReadChange,
}: Options) {
  const [dividerAfterMessageId, setDividerAfterMessageId] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const scrollInitRef = useRef<string | null>(null);
  const prevMessageCountRef = useRef(0);
  const anchorTimerRef = useRef<number | undefined>(undefined);
  const readTimersRef = useRef(new Map<string, number>());
  const visibleUnreadRef = useRef(new Set<string>());
  const dividerRef = useRef<string | null>(null);
  const wasAtBottomRef = useRef(true);
  const isUserEngagedRef = useRef(isUserEngaged);

  isUserEngagedRef.current = isUserEngaged;

  dividerRef.current = dividerAfterMessageId;

  const clearReadTimers = useCallback(() => {
    for (const timer of readTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    readTimersRef.current.clear();
  }, []);

  const clearReadTimerFor = useCallback((messageId: string) => {
    const timer = readTimersRef.current.get(messageId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      readTimersRef.current.delete(messageId);
    }
  }, []);

  const clearAnchorTimer = useCallback(() => {
    if (anchorTimerRef.current !== undefined) {
      window.clearTimeout(anchorTimerRef.current);
      anchorTimerRef.current = undefined;
    }
  }, []);

  const markReadThrough = useCallback(
    (messageId: string) => {
      if (!messageId || messages.length === 0) return;
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;

      const lastReadId = getLastReadMessageId(userId, channelId);
      if (!isMessageAfterReadAnchor(messages, messageId, lastReadId)) return;

      setLastReadMessageId(userId, channelId, messageId);
      const stillUnread = idx < messages.length - 1;
      setDividerAfterMessageId(stillUnread ? messageId : null);
      if (!stillUnread) clearAnchorTimer();
      onReadChange?.(messageId, !stillUnread);
    },
    [channelId, clearAnchorTimer, messages, onReadChange, userId],
  );

  const markAllRead = useCallback(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    clearReadTimers();
    clearAnchorTimer();
    setLastReadMessageId(userId, channelId, last.id);
    setDividerAfterMessageId(null);
    onReadChange?.(last.id, true);
  }, [channelId, clearAnchorTimer, clearReadTimers, messages, onReadChange, userId]);

  const startAnchorTimer = useCallback(
    (anchorId: string) => {
      clearAnchorTimer();
      anchorTimerRef.current = window.setTimeout(() => {
        if (dividerRef.current !== anchorId) return;
        const el = listRef.current;
        if (!el) return;
        scrollToBottom(el, 'smooth');
        setAtBottom(true);
        markAllRead();
      }, READ_ANCHOR_STALE_MS);
    },
    [clearAnchorTimer, listRef, markAllRead],
  );

  const handleMessageRead = useCallback(
    (messageId: string) => {
      markReadThrough(messageId);
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx >= 0 && idx < messages.length - 1) {
        startAnchorTimer(messageId);
      }
    },
    [markReadThrough, messages, startAnchorTimer],
  );

  const startReadTimerFor = useCallback(
    (messageId: string) => {
      if (!isUserEngagedRef.current || readTimersRef.current.has(messageId)) return;
      const timer = window.setTimeout(() => {
        readTimersRef.current.delete(messageId);
        handleMessageRead(messageId);
      }, READ_VISIBLE_MS);
      readTimersRef.current.set(messageId, timer);
    },
    [handleMessageRead],
  );

  const syncVisibleReadTimers = useCallback(() => {
    clearReadTimers();
    if (!isUserEngagedRef.current) return;
    for (const messageId of visibleUnreadRef.current) {
      startReadTimerFor(messageId);
    }
  }, [clearReadTimers, startReadTimerFor]);

  const syncDividerFromStorage = useCallback(() => {
    const lastReadId = getLastReadMessageId(userId, channelId);
    if (!hasUnreadMessages(messages, lastReadId)) {
      setDividerAfterMessageId(null);
      return;
    }
    if (lastReadId) {
      setDividerAfterMessageId(lastReadId);
      startAnchorTimer(lastReadId);
    }
  }, [channelId, messages, startAnchorTimer, userId]);

  useEffect(() => {
    scrollInitRef.current = null;
    prevMessageCountRef.current = 0;
    visibleUnreadRef.current.clear();
    clearReadTimers();
    clearAnchorTimer();
    setDividerAfterMessageId(null);
    setAtBottom(true);
    wasAtBottomRef.current = true;

    return () => {
      visibleUnreadRef.current.clear();
      clearReadTimers();
      clearAnchorTimer();
    };
  }, [channelId, clearAnchorTimer, clearReadTimers]);

  useLayoutEffect(() => {
    if (highlightMessageId) return;
    if (!channelId || !userId || messages.length === 0) {
      prevMessageCountRef.current = messages.length;
      return;
    }

    const messagesJustLoaded = prevMessageCountRef.current === 0;
    prevMessageCountRef.current = messages.length;
    if (scrollInitRef.current === channelId && !messagesJustLoaded) return;

    const el = listRef.current;
    const lastReadId = getLastReadMessageId(userId, channelId);
    const anchorIdx = findReadAnchorIndex(messages, lastReadId);
    const unread = hasUnreadMessages(messages, lastReadId);

    scrollInitRef.current = channelId;

    if (!lastReadId) {
      if (el) scrollToBottom(el);
      setDividerAfterMessageId(null);
      setAtBottom(true);
      return;
    }

    if (unread) {
      if (anchorIdx >= 0) {
        scrollToMessage(lastReadId);
        setDividerAfterMessageId(lastReadId);
        startAnchorTimer(lastReadId);
      } else if (el) {
        scrollToBottom(el);
        setDividerAfterMessageId(null);
      }
      setAtBottom(false);
      return;
    }

    if (el) scrollToBottom(el);
    setDividerAfterMessageId(null);
    setAtBottom(true);
  }, [
    channelId,
    highlightMessageId,
    listRef,
    messages,
    startAnchorTimer,
    userId,
  ]);

  useEffect(() => {
    if (highlightMessageId) return;
    syncDividerFromStorage();
  }, [highlightMessageId, messages, syncDividerFromStorage]);

  useEffect(() => {
    if (highlightMessageId) {
      clearReadTimers();
      return;
    }

    const lastReadId = getLastReadMessageId(userId, channelId);
    if (!hasUnreadMessages(messages, lastReadId)) {
      clearReadTimers();
      return;
    }

    const el = listRef.current;
    if (!el) return;

    const unreadIds = getUnreadMessageIds(messages, lastReadId);
    if (unreadIds.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id.replace('message-', '');
          if (!unreadIds.includes(id)) continue;

          if (entry.intersectionRatio >= READ_VISIBLE_RATIO) {
            visibleUnreadRef.current.add(id);
            startReadTimerFor(id);
          } else {
            visibleUnreadRef.current.delete(id);
            clearReadTimerFor(id);
          }
        }
      },
      { root: el, threshold: [0, READ_VISIBLE_RATIO, 1] },
    );

    for (const id of unreadIds) {
      const node = document.getElementById(`message-${id}`);
      if (node) observer.observe(node);
    }

    return () => {
      observer.disconnect();
      visibleUnreadRef.current.clear();
      clearReadTimers();
    };
  }, [
    channelId,
    clearReadTimerFor,
    clearReadTimers,
    highlightMessageId,
    listRef,
    messages,
    startReadTimerFor,
    userId,
  ]);

  useEffect(() => {
    if (highlightMessageId) return;
    syncVisibleReadTimers();
  }, [highlightMessageId, isUserEngaged, syncVisibleReadTimers]);

  const handleListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;

    const nearBottom = isNearBottom(el);
    const wasAtBottom = wasAtBottomRef.current;
    wasAtBottomRef.current = nearBottom;
    setAtBottom(nearBottom);

    if (highlightMessageId) return;

    if (nearBottom && !wasAtBottom && isUserEngagedRef.current) {
      markAllRead();
      return;
    }

    if (!nearBottom) {
      syncDividerFromStorage();
    }
  }, [highlightMessageId, listRef, markAllRead, syncDividerFromStorage]);

  const scrollToLatest = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    scrollToBottom(el, 'smooth');
    setAtBottom(true);
    wasAtBottomRef.current = true;
    markAllRead();
  }, [listRef, markAllRead]);

  const lastReadId = getLastReadMessageId(userId, channelId);
  const unread = hasUnreadMessages(messages, lastReadId);
  const showDivider = !!dividerAfterMessageId && unread && !atBottom && !highlightMessageId;
  const autoScrollToBottom = !highlightMessageId && atBottom;
  const isCaughtUp = !highlightMessageId && !unread;

  useEffect(() => {
    if (!onReadChange || highlightMessageId) return;
    onReadChange(lastReadId, isCaughtUp);
  }, [highlightMessageId, isCaughtUp, lastReadId, messages, onReadChange, dividerAfterMessageId, atBottom]);

  return {
    dividerAfterMessageId: showDivider ? dividerAfterMessageId : null,
    autoScrollToBottom,
    handleListScroll,
    scrollToLatest,
    isCaughtUp,
  };
}