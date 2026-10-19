import { useCallback, useMemo } from 'react';
import type {
  Category,
  Channel,
  ChannelUnreadSummary,
  LinkItem,
  MediaItem,
  Message,
  ServerInfo,
  ServerStats,
  User,
} from '../types';
import { getToken } from '../lib/session';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `API error: ${res.status}`);
  return data as T;
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useApi() {
  const getSetupStatus = useCallback(
    () => fetchJson<{ needsOnboarding: boolean }>('/api/setup/status'),
    []
  );

  const onboard = useCallback(
    (username: string, password: string, serverName: string) =>
      fetchJson<{ token: string; user: User }>('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, serverName }),
      }),
    []
  );

  const login = useCallback(
    (username: string, password: string) =>
      fetchJson<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }),
    []
  );

  const join = useCallback(
    (username: string) =>
      fetchJson<{ token: string; user: User }>('/api/auth/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      }),
    []
  );

  const checkUsername = useCallback(
    (username: string) =>
      fetchJson<{ requiresPassword: boolean }>(`/api/auth/check?username=${encodeURIComponent(username)}`),
    []
  );

  const getServer = useCallback(() => fetchJson<ServerInfo>('/api/server'), []);
  const getServerStats = useCallback(
    () => fetchJson<ServerStats>('/api/server/stats', { headers: authHeaders() }),
    []
  );
  const getCategories = useCallback(() => fetchJson<Category[]>('/api/categories'), []);
  const getChannels = useCallback(
    () => fetchJson<Channel[]>('/api/channels', { headers: authHeaders() }),
    []
  );
  const getUsers = useCallback(() => fetchJson<User[]>('/api/users'), []);
  const getMessages = useCallback(
    (channelId: string) =>
      fetchJson<Message[]>(`/api/channels/${channelId}/messages`, { headers: authHeaders() }),
    []
  );
  const getMessage = useCallback(
    (messageId: string) =>
      fetchJson<Message>(`/api/messages/${messageId}`, { headers: authHeaders() }),
    []
  );
  const getChannelStats = useCallback(
    (channelId: string) =>
      fetchJson<{ messageCount: number }>(`/api/channels/${channelId}/stats`, { headers: authHeaders() }),
    []
  );
  const getChannelUnread = useCallback(
    (reads: Record<string, string | null>) =>
      fetchJson<ChannelUnreadSummary[]>('/api/channels/unread', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reads }),
      }),
    []
  );
  const getMedia = useCallback((channelId?: string) => {
    const q = channelId ? `?channelId=${channelId}` : '';
    return fetchJson<{ media: MediaItem[]; links: LinkItem[] }>(`/api/media${q}`, { headers: authHeaders() });
  }, []);
  const searchMessages = useCallback((query: string, channelId?: string) => {
    const params = new URLSearchParams({ q: query });
    if (channelId) params.set('channelId', channelId);
    return fetchJson<Message[]>(`/api/search?${params}`, { headers: authHeaders() });
  }, []);

  const updateServer = useCallback(
    (data: {
      name?: string;
      description?: string;
      loginDisabled?: boolean;
      loginNotice?: string;
      uncategorizedReadAccess?: 'everyone' | 'admin';
      uncategorizedWriteAccess?: 'everyone' | 'admin';
    }) =>
      fetchJson<ServerInfo>('/api/admin/server', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data),
      }),
    []
  );

  const endSessionsByRole = useCallback(
    (role: 'admin' | 'member') =>
      fetchJson<{ ok: boolean; endedCount: number }>('/api/admin/sessions/end-by-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ role }),
      }),
    []
  );

  const reorderCategories = useCallback(
    (orderedIds: string[]) =>
      fetchJson<Category[]>('/api/admin/categories/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ orderedIds }),
      }),
    []
  );

  const reorderChannels = useCallback(
    (orderedIds: string[]) =>
      fetchJson<Channel[]>('/api/admin/channels/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ orderedIds }),
      }),
    []
  );

  const updateChannelLayout = useCallback(
    (items: Array<{ id: string; categoryId: string | null; position: number }>) =>
      fetchJson<Channel[]>('/api/admin/channels/layout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ items }),
      }),
    []
  );

  const createCategory = useCallback(
    (name: string) =>
      fetchJson<Category>('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name }),
      }),
    []
  );

  const updateCategory = useCallback(
    (id: string, data: Partial<Pick<Category, 'name' | 'readAccess' | 'writeAccess'>>) =>
      fetchJson<Category>(`/api/admin/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data),
      }),
    []
  );

  const deleteCategory = useCallback(
    (id: string) =>
      fetchJson<{ ok: boolean }>(`/api/admin/categories/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      }),
    []
  );

  const createChannel = useCallback(
    (data: { name: string; topic?: string; description?: string; categoryId?: string | null }) =>
      fetchJson<Channel>('/api/admin/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data),
      }),
    []
  );

  const updateChannel = useCallback(
    (id: string, data: Partial<Channel>) =>
      fetchJson<Channel>(`/api/admin/channels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data),
      }),
    []
  );

  const deleteChannel = useCallback(
    (id: string) =>
      fetchJson<{ ok: boolean }>(`/api/admin/channels/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      }),
    []
  );

  const deleteMessage = useCallback(
    (id: string) =>
      fetchJson<{ message: Message }>(`/api/admin/messages/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      }),
    []
  );

  const banUser = useCallback(
    (id: string, reason?: string) =>
      fetchJson<User>(`/api/admin/users/${id}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ reason }),
      }),
    []
  );

  const timeoutUser = useCallback(
    (id: string, minutes: number, reason?: string) =>
      fetchJson<User>(`/api/admin/users/${id}/timeout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ minutes, reason }),
      }),
    []
  );

  const unbanUser = useCallback(
    (id: string) =>
      fetchJson<User>(`/api/admin/users/${id}/unban`, {
        method: 'POST',
        headers: authHeaders(),
      }),
    []
  );

  const endSession = useCallback(
    (id: string) =>
      fetchJson<{ ok: boolean }>(`/api/admin/users/${id}/end-session`, {
        method: 'POST',
        headers: authHeaders(),
      }),
    []
  );

  return useMemo(
    () => ({
      getSetupStatus,
      onboard,
      login,
      join,
      checkUsername,
      getServer,
      getServerStats,
      getCategories,
      getChannels,
      getUsers,
      getMessages,
      getMessage,
      getChannelStats,
      getChannelUnread,
      getMedia,
      searchMessages,
      updateServer,
      endSessionsByRole,
      reorderCategories,
      reorderChannels,
      updateChannelLayout,
      createCategory,
      updateCategory,
      deleteCategory,
      createChannel,
      updateChannel,
      deleteChannel,
      deleteMessage,
      banUser,
      timeoutUser,
      unbanUser,
      endSession,
    }),
    [
      getSetupStatus,
      onboard,
      login,
      join,
      checkUsername,
      getServer,
      getServerStats,
      getCategories,
      getChannels,
      getUsers,
      getMessages,
      getMessage,
      getChannelStats,
      getChannelUnread,
      getMedia,
      searchMessages,
      updateServer,
      endSessionsByRole,
      reorderCategories,
      reorderChannels,
      updateChannelLayout,
      createCategory,
      updateCategory,
      deleteCategory,
      createChannel,
      updateChannel,
      deleteChannel,
      deleteMessage,
      banUser,
      timeoutUser,
      unbanUser,
      endSession,
    ]
  );
}