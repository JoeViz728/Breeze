import type { Message } from '../types';

export function ensureMessageInList(messages: Message[], target: Message): Message[] {
  if (messages.some((m) => m.id === target.id)) return messages;
  return [...messages, target].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}