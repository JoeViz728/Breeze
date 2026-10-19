import * as db from './db.js';
import type { Attachment, LinkPreview } from './types.js';

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|ogg)(\?.*)?$/i;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  return [...new Set(matches.map((u) => u.replace(/[.,;:!?)]+$/, '')))];
}

export function detectMediaAttachments(_text: string): Attachment[] {
  return [];
}

function parseMessageLinkPath(url: string): { channelId: string; messageId: string } | null {
  try {
    const pathname = url.startsWith('http')
      ? new URL(url).pathname
      : url.split('?')[0].split('#')[0];
    const parts = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (parts[0] === 'channels' && parts[1] && parts[2]) {
      return {
        channelId: decodeURIComponent(parts[1]),
        messageId: decodeURIComponent(parts[2]),
      };
    }
  } catch {
    // invalid URL
  }
  return null;
}

function buildDirectMediaPreview(url: string): LinkPreview {
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // keep raw url
  }
  return { url, title: hostname, image: url, siteName: hostname };
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function buildMessageLinkPreview(url: string, link: { channelId: string; messageId: string }): LinkPreview {
  const message = db.getMessageById(link.messageId);
  if (!message || message.channelId !== link.channelId) {
    return {
      url,
      kind: 'message',
      messageId: link.messageId,
      channelId: link.channelId,
      title: 'Message not found',
    };
  }

  const user = db.getUserById(message.userId);
  const channel = db.getChannelById(message.channelId);
  const description = message.deleted ? 'Message deleted.' : truncateText(message.content, 200);

  return {
    url,
    kind: 'message',
    messageId: message.id,
    channelId: message.channelId,
    createdAt: message.createdAt,
    title: user?.username || 'Unknown',
    description,
    siteName: channel?.name,
  };
}

export async function fetchLinkPreviews(text: string): Promise<LinkPreview[]> {
  const urls = extractUrls(text);
  const previews: LinkPreview[] = [];

  for (const url of urls) {
    if (IMAGE_EXT.test(url) || VIDEO_EXT.test(url)) {
      previews.push(buildDirectMediaPreview(url));
      continue;
    }

    const messageLink = parseMessageLinkPath(url);
    if (messageLink) {
      previews.push(buildMessageLinkPreview(url, messageLink));
      continue;
    }

    try {
      const preview = await fetchOpenGraph(url);
      if (preview) previews.push(preview);
    } catch {
      previews.push({ url, title: new URL(url).hostname });
    }
  }

  return previews;
}

async function fetchOpenGraph(url: string): Promise<LinkPreview | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'BreezeBot/1.0 (link preview)' },
      redirect: 'follow',
    });

    if (!res.ok) return { url, title: new URL(url).hostname };

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return { url, title: new URL(url).hostname };
    }

    const html = await res.text();
    const title = extractMeta(html, 'og:title') || extractTag(html, 'title') || new URL(url).hostname;
    const description = extractMeta(html, 'og:description') || extractMeta(html, 'description');
    const image =
      extractMeta(html, 'og:image') ||
      extractMeta(html, 'twitter:image') ||
      extractMeta(html, 'og:video:secure_url') ||
      extractMeta(html, 'og:video');
    const siteName = extractMeta(html, 'og:site_name');

    return { url, title, description: description || undefined, image: image || undefined, siteName: siteName || undefined };
  } finally {
    clearTimeout(timeout);
  }
}

function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1]);
  }
  return null;
}

function extractTag(html: string, tag: string): string | null {
  const match = html.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i'));
  return match?.[1] ? decodeEntities(match[1].trim()) : null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}