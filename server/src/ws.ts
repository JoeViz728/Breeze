import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { User } from './types.js';
import * as db from './db.js';
import * as auth from './auth.js';
import { canWriteChannel, filterReadableChannels } from './permissions.js';
import { detectMediaAttachments, fetchLinkPreviews } from './linkParser.js';
import { setBroadcast } from './broadcast.js';

interface Client {
  ws: WebSocket;
  userId: string;
  username: string;
  token: string;
}

const clients = new Map<WebSocket, Client>();
const connectionCounts = new Map<string, number>();

function addUserConnection(userId: string) {
  const count = connectionCounts.get(userId) || 0;
  connectionCounts.set(userId, count + 1);
  if (count === 0) db.setUserStatus(userId, 'online');
}

function removeUserConnection(userId: string) {
  const count = connectionCounts.get(userId) || 0;
  if (count <= 1) {
    connectionCounts.delete(userId);
    db.setUserStatus(userId, 'offline');
  } else {
    connectionCounts.set(userId, count - 1);
  }
}

function broadcastPresence() {
  broadcast({ type: 'presence', payload: { users: db.getUsers() } });
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  setBroadcast(broadcast);

  wss.on('connection', (ws) => {
    ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        await handleMessage(ws, data);
      } catch (err) {
        console.error('WS message error:', err);
      }
    });

    ws.on('close', () => {
      const client = clients.get(ws);
      if (client) {
        clients.delete(ws);
        removeUserConnection(client.userId);
        broadcastPresence();
      }
    });
  });

  return wss;
}

async function handleMessage(ws: WebSocket, data: { type: string; payload?: Record<string, unknown> }) {
  switch (data.type) {
    case 'auth': {
      await handleAuth(ws, data.payload || {});
      break;
    }

    case 'message': {
      const client = clients.get(ws);
      if (!client) {
        send(ws, { type: 'error', payload: { message: 'Not authenticated.' } });
        return;
      }
      const user = db.getUserById(client.userId);
      if (!user || auth.isUserBanned(user)) {
        send(ws, { type: 'kicked', payload: { message: user ? auth.getBanMessage(user) : 'Access denied.' } });
        ws.close();
        return;
      }

      const channelId = data.payload?.channelId as string;
      const content = (data.payload?.content as string)?.trim();
      if (!channelId || !content) return;

      const channel = db.getChannelById(channelId);
      if (!channel || !canWriteChannel(channel, user.role)) {
        send(ws, { type: 'error', payload: { message: 'You cannot post in this channel.' } });
        return;
      }

      const attachments = detectMediaAttachments(content);
      const linkPreviews = await fetchLinkPreviews(content);
      const message = db.createMessage(channelId, client.userId, content, attachments, linkPreviews);

      broadcast({ type: 'message', payload: { message, user } });
      break;
    }

    case 'typing': {
      const client = clients.get(ws);
      if (!client) return;
      broadcast(
        { type: 'typing', payload: { channelId: data.payload?.channelId, username: client.username } },
        ws
      );
      break;
    }
  }
}

async function handleAuth(ws: WebSocket, payload: Record<string, unknown>) {
  const token = payload.token as string | undefined;
  const username = (payload.username as string)?.trim();
  const password = payload.password as string | undefined;

  if (db.needsOnboarding()) {
    send(ws, { type: 'error', payload: { message: 'Server requires onboarding.', needsOnboarding: true } });
    return;
  }

  let result: { user: User; token: string } | null = null;

  if (token) {
    const user = auth.authenticateWithToken(token);
    if (user) result = { user, token };
  } else if (password && username) {
    result = await auth.authenticateWithPassword(username, password);
    if (!result) {
      const user = db.getUserByUsername(username);
      if (user && auth.isUserBanned(user)) {
        send(ws, { type: 'error', payload: { message: auth.getBanMessage(user) } });
        return;
      }
      send(ws, { type: 'error', payload: { message: 'Invalid credentials.' } });
      return;
    }
  } else if (username) {
    const existing = db.getUserByUsername(username);
    if (existing?.passwordHash) {
      send(ws, { type: 'error', payload: { message: 'Password required.', requiresPassword: true } });
      return;
    }
    result = auth.authenticateGuest(username);
    if (!result && existing && auth.isUserBanned(existing)) {
      send(ws, { type: 'error', payload: { message: auth.getBanMessage(existing) } });
      return;
    }
  }

  if (!result) {
    send(ws, { type: 'error', payload: { message: 'Authentication failed.' } });
    return;
  }

  const existing = clients.get(ws);
  if (existing) removeUserConnection(existing.userId);

  addUserConnection(result.user.id);
  clients.set(ws, { ws, userId: result.user.id, username: result.user.username, token: result.token });

  const freshUser = db.getUserById(result.user.id)!;
  const allUsers = db.getUsers();

  send(ws, {
    type: 'auth_ok',
    payload: {
      user: freshUser,
      token: result.token,
      server: db.getServerInfo(),
      channels: filterReadableChannels(db.getChannels(), freshUser),
      categories: db.getCategories(),
      users: allUsers,
    },
  });
  broadcastPresence();
}

function send(ws: WebSocket, data: { type: string; payload?: unknown }) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export function broadcastChannelsSync() {
  const allChannels = db.getChannels();
  const categories = db.getCategories();

  for (const [ws, client] of clients) {
    const user = db.getUserById(client.userId);
    send(ws, {
      type: 'channels_updated',
      payload: {
        channels: filterReadableChannels(allChannels, user),
        categories,
      },
    });
  }
}

export function kickUser(userId: string, message: string) {
  let kicked = false;
  for (const [ws, client] of clients) {
    if (client.userId !== userId) continue;
    send(ws, { type: 'kicked', payload: { message } });
    clients.delete(ws);
    ws.close();
    kicked = true;
  }
  if (!kicked) return;

  connectionCounts.delete(userId);
  db.setUserStatus(userId, 'offline');
  broadcastPresence();
}

function broadcast(data: { type: string; payload?: unknown }, exclude?: WebSocket) {
  const msg = JSON.stringify(data);

  if (data.type === 'user_moderated') {
    const { user, action } = data.payload as { user: User; action: string };
    if (action === 'ban' || action === 'timeout') {
      for (const [ws, client] of clients) {
        if (client.userId !== user.id) continue;
        send(ws, { type: 'kicked', payload: { message: auth.getBanMessage(user) } });
        clients.delete(ws);
        ws.close();
      }
      connectionCounts.delete(user.id);
    }
  }

  for (const [ws] of clients) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}