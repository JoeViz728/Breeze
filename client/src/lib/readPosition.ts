import { READ_POSITION_MAX_AGE_MS } from './constants';

const STORAGE_PREFIX = 'breeze_read';

interface StoredReadPosition {
  messageId: string;
  updatedAt: number;
}

function storageKey(userId: string, channelId: string) {
  return `${STORAGE_PREFIX}_${userId}_${channelId}`;
}

export function getStoredReadPosition(userId: string, channelId: string): StoredReadPosition | null {
  try {
    const raw = localStorage.getItem(storageKey(userId, channelId));
    if (!raw) return null;
    return JSON.parse(raw) as StoredReadPosition;
  } catch {
    return null;
  }
}

export function isReadPositionExpired(userId: string, channelId: string): boolean {
  const stored = getStoredReadPosition(userId, channelId);
  if (!stored) return false;
  return Date.now() - stored.updatedAt > READ_POSITION_MAX_AGE_MS;
}

export function getLastReadMessageId(userId: string, channelId: string): string | null {
  if (isReadPositionExpired(userId, channelId)) return null;
  return getStoredReadPosition(userId, channelId)?.messageId ?? null;
}

export function setLastReadMessageId(userId: string, channelId: string, messageId: string) {
  try {
    localStorage.setItem(
      storageKey(userId, channelId),
      JSON.stringify({ messageId, updatedAt: Date.now() } satisfies StoredReadPosition),
    );
  } catch {
    // ignore quota errors
  }
}

export function buildReadPositionsMap(
  userId: string,
  channelIds: string[],
): Record<string, string | null> {
  const reads: Record<string, string | null> = {};
  for (const channelId of channelIds) {
    reads[channelId] = getLastReadMessageId(userId, channelId);
  }
  return reads;
}

export function findReadAnchorIndex(messages: { id: string }[], lastReadId: string | null): number {
  if (!lastReadId) return -1;
  return messages.findIndex((m) => m.id === lastReadId);
}

export function hasUnreadMessages(messages: { id: string }[], lastReadId: string | null): boolean {
  if (messages.length === 0) return false;
  const idx = findReadAnchorIndex(messages, lastReadId);
  if (idx === -1) return messages.length > 0;
  return idx < messages.length - 1;
}

export function getUnreadMessageIds(messages: { id: string }[], afterMessageId: string | null): string[] {
  if (!afterMessageId) return messages.map((m) => m.id);
  const idx = messages.findIndex((m) => m.id === afterMessageId);
  if (idx === -1) return messages.map((m) => m.id);
  return messages.slice(idx + 1).map((m) => m.id);
}

/** True when messageId is strictly after the stored read anchor in the log. */
export function isMessageAfterReadAnchor(
  messages: { id: string }[],
  messageId: string,
  lastReadId: string | null,
): boolean {
  const messageIdx = messages.findIndex((m) => m.id === messageId);
  if (messageIdx === -1) return false;
  const anchorIdx = findReadAnchorIndex(messages, lastReadId);
  if (anchorIdx === -1) return true;
  return messageIdx > anchorIdx;
}