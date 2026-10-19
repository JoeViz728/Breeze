import type { ServerPage } from '../types';

const SERVER_PAGES: ServerPage[] = ['info', 'members', 'media', 'search', 'settings'];

export type AppRoute =
  | { view: 'home' }
  | { view: 'server'; page: ServerPage }
  | { view: 'channel'; channelId: string; messageId?: string };

export function parsePath(pathname: string): AppRoute {
  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

  if (parts.length === 0) return { view: 'home' };

  if (parts[0] === 'server' && parts[1] && SERVER_PAGES.includes(parts[1] as ServerPage)) {
    return { view: 'server', page: parts[1] as ServerPage };
  }

  if (parts[0] === 'channels' && parts[1]) {
    return {
      view: 'channel',
      channelId: decodeURIComponent(parts[1]),
      messageId: parts[2] ? decodeURIComponent(parts[2]) : undefined,
    };
  }

  return { view: 'home' };
}

export function buildPath(route: AppRoute): string {
  if (route.view === 'server') return `/server/${route.page}`;
  if (route.view === 'channel') {
    const base = `/channels/${encodeURIComponent(route.channelId)}`;
    return route.messageId ? `${base}/${encodeURIComponent(route.messageId)}` : base;
  }
  return '/';
}

export function isDeepLink(pathname: string): boolean {
  return parsePath(pathname).view !== 'home';
}

export function routeTitle(route: AppRoute, serverName: string, channelName?: string): string {
  const brand = serverName || 'Breeze';
  if (route.view === 'server') {
    const labels: Record<ServerPage, string> = {
      info: 'Server Info',
      members: 'Members',
      media: 'Media & Links',
      search: 'Search',
      settings: 'Server Settings',
    };
    return `${labels[route.page]} — ${brand}`;
  }
  if (route.view === 'channel' && channelName) {
    const base = `#${channelName} — ${brand}`;
    return route.messageId ? `Message — ${base}` : base;
  }
  return brand;
}