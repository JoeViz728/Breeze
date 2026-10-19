import { useCallback, useEffect, useRef, useState } from 'react';
import type { Category, Channel, ServerInfo, User } from '../types';
import { getToken, setToken, clearToken } from '../lib/session';

type WsHandler = (data: { type: string; payload?: unknown }) => void;

interface AuthOkPayload {
  user: User;
  token: string;
  server?: ServerInfo;
  channels?: Channel[];
  categories?: Category[];
  users?: User[];
}

export function useWebSocket(onMessage: WsHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onMessage);
  const pendingAuth = useRef<Record<string, unknown> | null>(null);
  const [connected, setConnected] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  handlerRef.current = onMessage;

  const send = useCallback((type: string, payload?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  const tryAuth = useCallback(() => {
    if (pendingAuth.current) {
      send('auth', pendingAuth.current);
    } else {
      const token = getToken();
      if (token) send('auth', { token });
    }
  }, [send]);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws`);

    ws.onopen = () => {
      setConnected(true);
      tryAuth();
    };

    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, 3000);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'auth_ok') {
        const payload = data.payload as AuthOkPayload;
        setToken(payload.token);
        setUser(payload.user);
        setAuthError(null);
        pendingAuth.current = null;
      }
      if (data.type === 'error') {
        const payload = data.payload as {
          message?: string;
          needsOnboarding?: boolean;
          requiresPassword?: boolean;
        };
        const msg = payload.message || 'Authentication failed.';
        const isLoginAttempt = !!(pendingAuth.current?.username);
        const hadStoredSession = !!(getToken() || pendingAuth.current?.token);

        if (payload.needsOnboarding) {
          clearToken();
          setUser(null);
          pendingAuth.current = null;
          setAuthError(msg);
        } else if (!isLoginAttempt && hadStoredSession) {
          // Stale or invalid resume token (e.g. server restarted during dev)
          clearToken();
          setUser(null);
          pendingAuth.current = null;
          setAuthError('Your session expired. Please sign in again.');
        } else {
          setAuthError(msg);
        }
      }
      if (data.type === 'kicked') {
        clearToken();
        setUser(null);
        setAuthError((data.payload as { message?: string })?.message || 'You were removed from the server.');
      }
      handlerRef.current(data);
    };

    wsRef.current = ws;
  }, [tryAuth]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  const authenticate = useCallback(
    (username: string, password?: string) => {
      setAuthError(null);
      pendingAuth.current = password ? { username, password } : { username };
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        send('auth', pendingAuth.current);
      }
    },
    [send]
  );

  const authenticateWithToken = useCallback(
    (token: string) => {
      setAuthError(null);
      setToken(token);
      pendingAuth.current = { token };
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        send('auth', { token });
      }
    },
    [send]
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    pendingAuth.current = null;
    wsRef.current?.close();
    connect();
  }, [connect]);

  const sendMessage = useCallback(
    (channelId: string, content: string) => {
      send('message', { channelId, content });
    },
    [send]
  );

  const sendTyping = useCallback(
    (channelId: string) => {
      send('typing', { channelId });
    },
    [send]
  );

  return {
    connected,
    user,
    authError,
    authenticate,
    authenticateWithToken,
    logout,
    sendMessage,
    sendTyping,
    clearAuthError: () => setAuthError(null),
  };
}