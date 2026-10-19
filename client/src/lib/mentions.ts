import type { Channel, User, UserRole } from '../types';

const ROLE_NAMES = ['admin', 'member'] as const;

export function isMentionLead(index: number, text: string): boolean {
  return index === 0 || /[\s\n]/.test(text[index - 1]);
}

export function isMentionTail(char: string | undefined): boolean {
  return char === undefined || /[\s,.!?;:)}\]'"]/.test(char);
}

export type MentionMatch =
  | { index: number; length: number; kind: 'user'; username: string; userId: string }
  | { index: number; length: number; kind: 'role'; role: string }
  | { index: number; length: number; kind: 'channel'; name: string; channelId?: string };

function matchAtMention(
  text: string,
  atIndex: number,
  users?: Pick<User, 'id' | 'username'>[],
): MentionMatch | null {
  const after = text.slice(atIndex + 1);
  let best: MentionMatch | null = null;

  for (const role of ROLE_NAMES) {
    if (!after.toLowerCase().startsWith(role)) continue;
    if (!isMentionTail(after[role.length])) continue;
    const candidate: MentionMatch = {
      index: atIndex,
      length: 1 + role.length,
      kind: 'role',
      role,
    };
    if (!best || candidate.length > best.length) best = candidate;
  }

  const sorted = [...(users ?? [])].sort((a, b) => b.username.length - a.username.length);
  for (const user of sorted) {
    if (!after.toLowerCase().startsWith(user.username.toLowerCase())) continue;
    if (!isMentionTail(after[user.username.length])) continue;
    const candidate: MentionMatch = {
      index: atIndex,
      length: 1 + user.username.length,
      kind: 'user',
      username: user.username,
      userId: user.id,
    };
    if (!best || candidate.length > best.length) best = candidate;
  }

  return best;
}

function matchHashMention(
  text: string,
  hashIndex: number,
  channels?: Pick<Channel, 'id' | 'name'>[],
): MentionMatch | null {
  const after = text.slice(hashIndex + 1);
  let best: MentionMatch | null = null;

  const sorted = [...(channels ?? [])].sort((a, b) => b.name.length - a.name.length);
  for (const channel of sorted) {
    if (!after.toLowerCase().startsWith(channel.name.toLowerCase())) continue;
    if (!isMentionTail(after[channel.name.length])) continue;
    const candidate: MentionMatch = {
      index: hashIndex,
      length: 1 + channel.name.length,
      kind: 'channel',
      name: channel.name,
      channelId: channel.id,
    };
    if (!best || candidate.length > best.length) best = candidate;
  }

  return best;
}

export function findEarliestMention(
  text: string,
  users?: Pick<User, 'id' | 'username'>[],
  channels?: Pick<Channel, 'id' | 'name'>[],
): MentionMatch | null {
  let best: MentionMatch | null = null;

  for (let i = 0; i < text.length; i++) {
    if (!isMentionLead(i, text)) continue;

    let candidate: MentionMatch | null = null;
    if (text[i] === '@') {
      candidate = matchAtMention(text, i, users);
    } else if (text[i] === '#') {
      candidate = matchHashMention(text, i, channels);
    }

    if (candidate && (!best || candidate.index < best.index)) {
      best = candidate;
    }
  }

  return best;
}

export function messageMentionsUser(
  content: string,
  userId: string,
  users: Pick<User, 'id' | 'username'>[],
): boolean {
  const target = users.find((u) => u.id === userId);
  if (!target) return false;

  for (let i = 0; i < content.length; i++) {
    if (content[i] !== '@' || !isMentionLead(i, content)) continue;
    const match = matchAtMention(content, i, users);
    if (match?.kind === 'user' && match.userId === target.id) return true;
  }
  return false;
}

export function messagePingsUser(
  content: string,
  userId: string,
  userRole: UserRole,
  users: Pick<User, 'id' | 'username'>[],
): boolean {
  if (messageMentionsUser(content, userId, users)) return true;

  for (let i = 0; i < content.length; i++) {
    if (content[i] !== '@' || !isMentionLead(i, content)) continue;
    const after = content.slice(i + 1).toLowerCase();
    if (after.startsWith(userRole) && isMentionTail(after[userRole.length])) return true;
  }
  return false;
}

export function matchesMentionQuery(name: string, query: string): boolean {
  if (!query) return true;
  return name.toLowerCase().startsWith(query.toLowerCase());
}