import type { Message } from '../types';

const TTL_MS = 10 * 60 * 1000;
const SERVER_SEARCH_KEY = 'breeze_server_search';

interface StoredSearchSession {
  query: string;
  results?: Message[];
  searched?: boolean;
  updatedAt: number;
}

function read(key: string): StoredSearchSession | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredSearchSession;
    if (Date.now() - data.updatedAt > TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function write(key: string, data: Omit<StoredSearchSession, 'updatedAt'>) {
  sessionStorage.setItem(
    key,
    JSON.stringify({ ...data, updatedAt: Date.now() } satisfies StoredSearchSession),
  );
}

export function channelSearchKey(channelId: string) {
  return `breeze_channel_search_${channelId}`;
}

export function loadChannelSearchQuery(channelId: string): string {
  return read(channelSearchKey(channelId))?.query ?? '';
}

export function saveChannelSearchQuery(channelId: string, query: string) {
  if (!query.trim()) {
    sessionStorage.removeItem(channelSearchKey(channelId));
    return;
  }
  write(channelSearchKey(channelId), { query });
}

export function loadServerSearchSession(): {
  query: string;
  results: Message[];
  searched: boolean;
} | null {
  const data = read(SERVER_SEARCH_KEY);
  if (!data) return null;
  return {
    query: data.query,
    results: data.results ?? [],
    searched: data.searched ?? false,
  };
}

export function saveServerSearchSession(query: string, results: Message[], searched: boolean) {
  if (!query.trim() && results.length === 0) {
    sessionStorage.removeItem(SERVER_SEARCH_KEY);
    return;
  }
  write(SERVER_SEARCH_KEY, { query, results, searched });
}