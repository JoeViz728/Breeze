import { parsePath } from './routes';

export interface ParsedMessageLink {
  channelId: string;
  messageId: string;
}

export function parseMessageLinkUrl(url: string): ParsedMessageLink | null {
  try {
    const pathname = url.startsWith('http')
      ? new URL(url).pathname
      : url.split('?')[0].split('#')[0];
    const route = parsePath(pathname);
    if (route.view === 'channel' && route.messageId) {
      return { channelId: route.channelId, messageId: route.messageId };
    }
  } catch {
    // invalid URL
  }
  return null;
}

export function isSameServerMessageLink(url: string): boolean {
  const link = parseMessageLinkUrl(url);
  if (!link) return false;
  if (url.startsWith('/') || url.startsWith('http://') || url.startsWith('https://')) {
    if (typeof window === 'undefined') return true;
    if (url.startsWith('/')) return true;
    try {
      return new URL(url).origin === window.location.origin;
    } catch {
      return false;
    }
  }
  return false;
}

export function formatMessageLinkLabel(messageId: string): string {
  return `Message ID ${messageId}`;
}