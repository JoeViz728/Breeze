import type { User, UserRole } from './types.js';

const ROLE_NAMES = ['admin', 'member'] as const;

function isMentionLead(index: number, text: string): boolean {
  return index === 0 || /[\s\n]/.test(text[index - 1]);
}

function isMentionTail(char: string | undefined): boolean {
  return char === undefined || /[\s,.!?;:)}\]'"]/.test(char);
}

type UserMention = { index: number; length: number; username: string; userId: string };

function matchAtMention(
  text: string,
  atIndex: number,
  users: Pick<User, 'id' | 'username'>[],
): UserMention | { index: number; length: number; kind: 'role'; role: string } | null {
  const after = text.slice(atIndex + 1);
  let best: UserMention | { index: number; length: number; kind: 'role'; role: string } | null = null;

  for (const role of ROLE_NAMES) {
    if (!after.toLowerCase().startsWith(role)) continue;
    if (!isMentionTail(after[role.length])) continue;
    const candidate = { index: atIndex, length: 1 + role.length, kind: 'role' as const, role };
    if (!best || candidate.length > best.length) best = candidate;
  }

  const sorted = [...users].sort((a, b) => b.username.length - a.username.length);
  for (const user of sorted) {
    if (!after.toLowerCase().startsWith(user.username.toLowerCase())) continue;
    if (!isMentionTail(after[user.username.length])) continue;
    const candidate: UserMention = {
      index: atIndex,
      length: 1 + user.username.length,
      username: user.username,
      userId: user.id,
    };
    if (!best || candidate.length > best.length) best = candidate;
  }

  return best;
}

export function messagePingsUser(
  content: string,
  userId: string,
  userRole: UserRole,
  users: Pick<User, 'id' | 'username'>[],
): boolean {
  const mentions = extractUserMentions(content, users);
  if (mentions.some((m) => m.userId === userId)) return true;

  for (let i = 0; i < content.length; i++) {
    if (content[i] !== '@' || !isMentionLead(i, content)) continue;
    const after = content.slice(i + 1).toLowerCase();
    if (after.startsWith(userRole) && isMentionTail(after[userRole.length])) return true;
  }
  return false;
}

export function extractUserMentions(
  content: string,
  users: Pick<User, 'id' | 'username'>[],
): { userId: string; username: string }[] {
  const found: { userId: string; username: string }[] = [];
  let i = 0;
  while (i < content.length) {
    if (content[i] === '@' && isMentionLead(i, content)) {
      const match = matchAtMention(content, i, users);
      if (match && 'userId' in match) {
        found.push({ userId: match.userId, username: match.username });
        i += match.length;
        continue;
      }
    }
    i++;
  }
  return found;
}