import { messagePingsUser } from './mentions';
import { getUnreadMessageIds } from './readPosition';
import type { Message, User, UserRole } from '../types';

function unreadFromOthers(
  messages: Message[],
  unreadIds: Set<string>,
  userId: string,
): Message[] {
  return messages.filter(
    (message) => !message.deleted && unreadIds.has(message.id) && message.userId !== userId,
  );
}

export function computeChannelUnread(
  messages: Message[],
  lastReadId: string | null,
  userId: string,
  userRole: UserRole,
  users: Pick<User, 'id' | 'username'>[],
): { hasUnread: boolean; mentionCount: number } {
  const unreadIds = new Set(getUnreadMessageIds(messages, lastReadId));
  const othersUnread = unreadFromOthers(messages, unreadIds, userId);

  if (othersUnread.length === 0) {
    return { hasUnread: false, mentionCount: 0 };
  }

  let mentionCount = 0;
  for (const message of othersUnread) {
    if (messagePingsUser(message.content, userId, userRole, users)) mentionCount++;
  }

  return { hasUnread: true, mentionCount };
}