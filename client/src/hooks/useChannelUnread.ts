import { useCallback, useEffect, useRef, useState } from 'react';
import { computeChannelUnread } from '../lib/channelUnread';
import { messagePingsUser } from '../lib/mentions';
import { buildReadPositionsMap, getLastReadMessageId, setLastReadMessageId } from '../lib/readPosition';
import type { Channel, ChannelUnreadInfo, Message, User, UserRole } from '../types';

type UnreadMap = Record<string, ChannelUnreadInfo>;

const HANDLED_MESSAGE_CAP = 500;

function rememberHandledMessage(ids: Set<string>, messageId: string) {
  ids.add(messageId);
  if (ids.size > HANDLED_MESSAGE_CAP) {
    const drop = ids.size - HANDLED_MESSAGE_CAP;
    let i = 0;
    for (const id of ids) {
      ids.delete(id);
      if (++i >= drop) break;
    }
  }
}

function toUnreadMap(
  entries: Array<{ channelId: string; hasUnread: boolean; mentionCount: number }>,
): UnreadMap {
  const map: UnreadMap = {};
  for (const entry of entries) {
    map[entry.channelId] = {
      hasUnread: entry.hasUnread,
      mentionCount: entry.mentionCount,
    };
  }
  return map;
}

interface Options {
  userId: string;
  userRole: UserRole;
  channels: Channel[];
  users: User[];
  activeChannelId: string;
  activeChannelCaughtUp: boolean;
  viewingChannel: boolean;
  getChannelUnread: (reads: Record<string, string | null>) => Promise<
    Array<{ channelId: string; hasUnread: boolean; mentionCount: number }>
  >;
}

export function useChannelUnread({
  userId,
  userRole,
  channels,
  users,
  activeChannelId,
  activeChannelCaughtUp,
  viewingChannel,
  getChannelUnread,
}: Options) {
  const [channelUnread, setChannelUnread] = useState<UnreadMap>({});
  const activeChannelIdRef = useRef(activeChannelId);
  const activeChannelCaughtUpRef = useRef(activeChannelCaughtUp);
  const viewingChannelRef = useRef(viewingChannel);
  const handledMessageIdsRef = useRef(new Set<string>());
  const refreshGenerationRef = useRef(0);

  activeChannelIdRef.current = activeChannelId;
  activeChannelCaughtUpRef.current = activeChannelCaughtUp;
  viewingChannelRef.current = viewingChannel;

  const invalidateInFlightRefresh = useCallback(() => {
    refreshGenerationRef.current += 1;
  }, []);

  const mergeUnreadSummary = useCallback(
    (entries: Array<{ channelId: string; hasUnread: boolean; mentionCount: number }>) => {
      setChannelUnread((prev) => ({ ...prev, ...toUnreadMap(entries) }));
    },
    [],
  );

  const refreshAll = useCallback(async () => {
    if (!userId || channels.length === 0) return;
    const generation = ++refreshGenerationRef.current;
    const reads = buildReadPositionsMap(
      userId,
      channels.map((c) => c.id),
    );
    const summary = await getChannelUnread(reads);
    if (generation !== refreshGenerationRef.current) return;
    setChannelUnread(toUnreadMap(summary));
  }, [channels, getChannelUnread, userId]);

  const refreshChannels = useCallback(
    async (channelIds: string[]) => {
      if (!userId || channelIds.length === 0) return;
      const generation = ++refreshGenerationRef.current;
      const reads: Record<string, string | null> = {};
      for (const channelId of channelIds) {
        reads[channelId] = getLastReadMessageId(userId, channelId);
      }
      const summary = await getChannelUnread(reads);
      if (generation !== refreshGenerationRef.current) return;
      const requested = new Set(channelIds);
      mergeUnreadSummary(summary.filter((entry) => requested.has(entry.channelId)));
    },
    [getChannelUnread, mergeUnreadSummary, userId],
  );

  useEffect(() => {
    if (!userId) return;
    void refreshAll();
  }, [refreshAll, userId]);

  const setChannelState = useCallback((channelId: string, info: ChannelUnreadInfo) => {
    setChannelUnread((prev) => {
      const current = prev[channelId];
      if (current?.hasUnread === info.hasUnread && current?.mentionCount === info.mentionCount) {
        return prev;
      }
      return { ...prev, [channelId]: info };
    });
  }, []);

  const syncActiveChannel = useCallback(
    (messages: Message[], lastReadId: string | null) => {
      if (!activeChannelId) return;
      setChannelState(
        activeChannelId,
        computeChannelUnread(messages, lastReadId, userId, userRole, users),
      );
    },
    [activeChannelId, setChannelState, userId, userRole, users],
  );

  const handleIncomingMessage = useCallback(
    (message: Message) => {
      if (message.deleted || !userId) return;
      if (handledMessageIdsRef.current.has(message.id)) return;
      rememberHandledMessage(handledMessageIdsRef.current, message.id);
      invalidateInFlightRefresh();

      if (message.userId === userId) {
        setLastReadMessageId(userId, message.channelId, message.id);
        if (message.channelId === activeChannelIdRef.current) {
          return;
        }
        void refreshChannels([message.channelId]);
        return;
      }

      if (
        message.channelId === activeChannelIdRef.current &&
        viewingChannelRef.current &&
        activeChannelCaughtUpRef.current
      ) {
        return;
      }

      // Viewing this channel while scrolled up: syncActiveChannel recomputes from loaded messages.
      if (message.channelId === activeChannelIdRef.current && viewingChannelRef.current) {
        return;
      }

      const pinged = messagePingsUser(message.content, userId, userRole, users);
      setChannelUnread((prev) => {
        const current = prev[message.channelId] ?? { hasUnread: false, mentionCount: 0 };
        return {
          ...prev,
          [message.channelId]: {
            hasUnread: true,
            mentionCount: current.mentionCount + (pinged ? 1 : 0),
          },
        };
      });
    },
    [invalidateInFlightRefresh, refreshChannels, userId, userRole, users],
  );

  return {
    channelUnread,
    refreshAll,
    refreshChannels,
    setChannelState,
    syncActiveChannel,
    handleIncomingMessage,
  };
}