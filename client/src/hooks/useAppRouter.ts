import { useCallback, useEffect, useRef } from 'react';
import { buildPath, parsePath, routeTitle, type AppRoute } from '../lib/routes';
import type { ServerPage } from '../types';

interface Options {
  enabled: boolean;
  serverName: string;
  channelName?: string;
  onRoute: (route: AppRoute) => void;
}

export function useAppRouter({ enabled, serverName, channelName, onRoute }: Options) {
  const onRouteRef = useRef(onRoute);
  onRouteRef.current = onRoute;

  const syncUrl = useCallback(
    (route: AppRoute, replace = false) => {
      const path = buildPath(route);
      const method = replace ? 'replaceState' : 'pushState';
      if (window.location.pathname !== path || window.location.search) {
        window.history[method](null, '', path);
      }
      document.title = routeTitle(route, serverName, channelName);
    },
    [serverName, channelName],
  );

  const navigate = useCallback(
    (route: AppRoute, options?: { replace?: boolean; silent?: boolean }) => {
      syncUrl(route, options?.replace);
      if (!options?.silent) onRouteRef.current(route);
    },
    [syncUrl],
  );

  const navigateToChannel = useCallback(
    (channelId: string, messageId?: string, replace?: boolean) => {
      navigate({ view: 'channel', channelId, messageId }, { replace });
    },
    [navigate],
  );

  const navigateToServerPage = useCallback(
    (page: ServerPage, replace?: boolean) => {
      navigate({ view: 'server', page }, { replace });
    },
    [navigate],
  );

  const navigateHome = useCallback(
    (replace?: boolean) => {
      navigate({ view: 'home' }, { replace });
    },
    [navigate],
  );

  useEffect(() => {
    if (!enabled) return;

    function handlePopState() {
      onRouteRef.current(parsePath(window.location.pathname));
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const route = parsePath(window.location.pathname);
    document.title = routeTitle(route, serverName, channelName);
  }, [enabled, serverName, channelName]);

  return {
    navigate,
    syncUrl,
    navigateToChannel,
    navigateToServerPage,
    navigateHome,
    parseCurrentPath: () => parsePath(window.location.pathname),
  };
}