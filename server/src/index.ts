import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import * as db from './db.js';
import * as auth from './auth.js';
import { optionalAuth, requireAdmin, requireAuth, type AuthedRequest } from './middleware.js';
import {
  canWriteChannel,
  filterReadableChannels,
  getChannelIfAllowed,
} from './permissions.js';
import { broadcast } from './broadcast.js';
import { broadcastChannelsSync, kickUser, setupWebSocket } from './ws.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const serverStartedAt = Date.now();

function getLanAddresses(): string[] {
  const addrs: string[] = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const net of interfaces ?? []) {
      if (net.family === 'IPv4' && !net.internal) addrs.push(net.address);
    }
  }
  return addrs;
}

function paramId(id: string | string[] | undefined): string {
  if (typeof id === 'string') return id;
  if (Array.isArray(id)) return id[0];
  return '';
}

db.markAllUsersOffline();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/setup/status', (_req, res) => {
  res.json({ needsOnboarding: db.needsOnboarding() });
});

app.post('/api/onboard', async (req, res) => {
  if (!db.needsOnboarding()) {
    res.status(400).json({ error: 'Server already onboarded' });
    return;
  }

  const username = (req.body.username as string)?.trim();
  const password = req.body.password as string;
  const serverName = (req.body.serverName as string)?.trim() || 'Breeze';

  if (!username || username.length < 2 || username.length > 24) {
    res.status(400).json({ error: 'Username must be 2–24 characters.' });
    return;
  }
  if (!password || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  const passwordHash = await auth.hashPassword(password);
  const user = db.createAdminUser(username, passwordHash, serverName);
  const token = auth.createSession(user.id);

  res.json({ token, user });
});

app.post('/api/auth/login', async (req, res) => {
  const username = (req.body.username as string)?.trim();
  const password = req.body.password as string;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required.' });
    return;
  }

  const server = db.getServerInfo();
  const existingUser = db.getUserByUsername(username);
  if (server.loginDisabled && existingUser?.role !== 'admin') {
    res.status(403).json({ error: server.loginNotice || 'Login is temporarily disabled.' });
    return;
  }

  const result = await auth.authenticateWithPassword(username, password);
  if (!result) {
    const user = db.getUserByUsername(username);
    if (user && auth.isUserBanned(user)) {
      res.status(403).json({ error: auth.getBanMessage(user) });
      return;
    }
    res.status(401).json({ error: 'Invalid credentials.' });
    return;
  }

  res.json(result);
});

app.post('/api/auth/join', (req, res) => {
  const username = (req.body.username as string)?.trim();
  if (!username) {
    res.status(400).json({ error: 'Username required.' });
    return;
  }

  if (db.needsOnboarding()) {
    res.status(400).json({ error: 'Server requires onboarding first.' });
    return;
  }

  const server = db.getServerInfo();
  if (server.loginDisabled) {
    res.status(403).json({ error: server.loginNotice || 'Login is temporarily disabled.' });
    return;
  }

  const existing = db.getUserByUsername(username);
  if (existing?.passwordHash) {
    res.status(400).json({ error: 'This account requires a password.', requiresPassword: true });
    return;
  }

  const result = auth.authenticateGuest(username);
  if (!result) {
    const user = existing ?? db.getUserByUsername(username);
    if (user && auth.isUserBanned(user)) {
      res.status(403).json({ error: auth.getBanMessage(user) });
      return;
    }
    res.status(400).json({ error: 'Could not join.' });
    return;
  }

  res.json(result);
});

app.get('/api/auth/check', (req, res) => {
  const username = (req.query.username as string)?.trim();
  res.json({ requiresPassword: username ? auth.userRequiresPassword(username) : false });
});

app.get('/api/server', (_req, res) => {
  res.json(db.getServerInfo());
});

app.get('/api/categories', (_req, res) => {
  res.json(db.getCategories());
});

app.get('/api/channels', optionalAuth, (req: AuthedRequest, res) => {
  const user = req.userId ? db.getUserById(req.userId) : null;
  res.json(filterReadableChannels(db.getChannels(), user));
});

app.post('/api/channels/unread', requireAuth, (req: AuthedRequest, res) => {
  const user = db.getUserById(req.userId!)!;
  const reads = (req.body?.reads ?? {}) as Record<string, string | null>;
  const readable = filterReadableChannels(db.getChannels(), user);
  res.json(
    readable.map((channel) => {
      const lastReadId = reads[channel.id] ?? null;
      const { unreadCount, mentionCount } = db.getChannelUnreadSince(channel.id, lastReadId, user);
      return {
        channelId: channel.id,
        hasUnread: unreadCount > 0,
        mentionCount,
      };
    }),
  );
});

app.get('/api/server/stats', optionalAuth, (req: AuthedRequest, res) => {
  const user = req.userId ? db.getUserById(req.userId) : null;
  const readable = filterReadableChannels(db.getChannels(), user);
  res.json(
    db.getServerStats(
      readable.map((c) => c.id),
      Date.now() - serverStartedAt,
      new Date(serverStartedAt).toISOString(),
    ),
  );
});

app.get('/api/channels/:id/stats', optionalAuth, (req: AuthedRequest, res) => {
  const channel = getChannelIfAllowed(paramId(req.params.id), req.userId ? db.getUserById(req.userId) : null);
  if (!channel) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  res.json({ messageCount: db.getChannelMessageCount(channel.id) });
});

app.get('/api/users', (_req, res) => {
  res.json(db.getUsers());
});

app.get('/api/channels/:id/messages', optionalAuth, (req: AuthedRequest, res) => {
  const user = req.userId ? db.getUserById(req.userId) : null;
  const channel = getChannelIfAllowed(paramId(req.params.id), user);
  if (!channel) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  res.json(db.getMessages(channel.id));
});

app.get('/api/messages/:id', requireAuth, (req: AuthedRequest, res) => {
  const message = db.getMessageById(paramId(req.params.id));
  if (!message) {
    res.status(404).json({ error: 'Message not found.' });
    return;
  }
  const user = db.getUserById(req.userId!);
  const channel = getChannelIfAllowed(message.channelId, user);
  if (!channel) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  res.json(message);
});

app.get('/api/media', optionalAuth, (req: AuthedRequest, res) => {
  const user = req.userId ? db.getUserById(req.userId) : null;
  const channelId = req.query.channelId as string | undefined;
  if (channelId) {
    const channel = getChannelIfAllowed(channelId, user);
    if (!channel) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    res.json(db.getMediaAndLinks(channel.id));
    return;
  }
  const readableIds = filterReadableChannels(db.getChannels(), user).map((c) => c.id);
  res.json(db.getMediaAndLinks(undefined, readableIds));
});

app.get('/api/search', optionalAuth, (req: AuthedRequest, res) => {
  const user = req.userId ? db.getUserById(req.userId) : null;
  const query = (req.query.q as string)?.trim();
  if (!query || query.length < 2) {
    res.json([]);
    return;
  }
  const channelId = req.query.channelId as string | undefined;
  let channelIds: string[];
  if (channelId) {
    const channel = getChannelIfAllowed(channelId, user);
    if (!channel) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    channelIds = [channel.id];
  } else {
    channelIds = filterReadableChannels(db.getChannels(), user).map((c) => c.id);
  }
  res.json(db.searchMessages(query, channelIds));
});

app.patch('/api/admin/server', requireAdmin, (req: AuthedRequest, res) => {
  const name = req.body.name !== undefined ? (req.body.name as string)?.trim() : undefined;
  const description = req.body.description !== undefined ? (req.body.description as string)?.trim() : undefined;
  const loginDisabled = req.body.loginDisabled;
  const loginNotice = req.body.loginNotice !== undefined ? (req.body.loginNotice as string)?.trim() : undefined;
  const uncategorizedReadAccess = req.body.uncategorizedReadAccess;
  const uncategorizedWriteAccess = req.body.uncategorizedWriteAccess;

  if (name !== undefined && !name) {
    res.status(400).json({ error: 'Server name required.' });
    return;
  }

  const server = db.updateServerInfo({
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(typeof loginDisabled === 'boolean' ? { loginDisabled } : {}),
    ...(loginNotice !== undefined ? { loginNotice } : {}),
    ...(uncategorizedReadAccess === 'everyone' || uncategorizedReadAccess === 'admin'
      ? { uncategorizedReadAccess }
      : {}),
    ...(uncategorizedWriteAccess === 'everyone' || uncategorizedWriteAccess === 'admin'
      ? { uncategorizedWriteAccess }
      : {}),
  });
  broadcast({ type: 'server_updated', payload: { server } });
  broadcastChannelsSync();
  res.json(server);
});

app.post('/api/admin/sessions/end-by-role', requireAdmin, (req: AuthedRequest, res) => {
  const role = req.body.role as string;
  if (role !== 'admin' && role !== 'member') {
    res.status(400).json({ error: 'Role must be admin or member.' });
    return;
  }

  const userIds = db.getUserIdsByRole(role).filter((id) => id !== req.userId);
  for (const userId of userIds) {
    auth.revokeAllSessionsForUser(userId);
    kickUser(userId, 'Your session was ended by an administrator.');
  }

  res.json({ ok: true, endedCount: userIds.length });
});

app.patch('/api/admin/categories/reorder', requireAdmin, (req, res) => {
  const orderedIds = req.body.orderedIds as string[] | undefined;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    res.status(400).json({ error: 'orderedIds array required.' });
    return;
  }
  const categories = db.reorderCategories(orderedIds);
  broadcast({ type: 'categories_updated', payload: { categories } });
  broadcastChannelsSync();
  res.json(categories);
});

app.patch('/api/admin/channels/reorder', requireAdmin, (req, res) => {
  const orderedIds = req.body.orderedIds as string[] | undefined;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    res.status(400).json({ error: 'orderedIds array required.' });
    return;
  }
  db.reorderChannels(orderedIds);
  broadcastChannelsSync();
  res.json(db.getChannels());
});

app.patch('/api/admin/channels/layout', requireAdmin, (req, res) => {
  const items = req.body.items as Array<{ id: string; categoryId: string | null; position: number }> | undefined;
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'items array required.' });
    return;
  }
  db.updateChannelLayout(items);
  broadcastChannelsSync();
  res.json(db.getChannels());
});

app.post('/api/admin/categories', requireAdmin, (req: AuthedRequest, res) => {
  const name = (req.body.name as string)?.trim();
  if (!name) {
    res.status(400).json({ error: 'Category name required.' });
    return;
  }
  const category = db.createCategory(name);
  broadcast({ type: 'categories_updated', payload: { categories: db.getCategories() } });
  broadcastChannelsSync();
  res.json(category);
});

app.patch('/api/admin/categories/:id', requireAdmin, (req, res) => {
  const data: Partial<Pick<import('./types.js').Category, 'name' | 'readAccess' | 'writeAccess'>> = {};
  if (typeof req.body.name === 'string') {
    const name = req.body.name.trim();
    if (!name) {
      res.status(400).json({ error: 'Category name cannot be empty.' });
      return;
    }
    data.name = name;
  }
  if (req.body.readAccess === 'everyone' || req.body.readAccess === 'admin') {
    data.readAccess = req.body.readAccess;
  }
  if (req.body.writeAccess === 'everyone' || req.body.writeAccess === 'admin') {
    data.writeAccess = req.body.writeAccess;
  }
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'No category fields to update.' });
    return;
  }
  const category = db.updateCategory(paramId(req.params.id), data);
  if (!category) {
    res.status(404).json({ error: 'Category not found.' });
    return;
  }
  broadcast({ type: 'categories_updated', payload: { categories: db.getCategories() } });
  broadcastChannelsSync();
  res.json(category);
});

app.delete('/api/admin/categories/:id', requireAdmin, (req, res) => {
  if (!db.deleteCategory(paramId(req.params.id))) {
    res.status(404).json({ error: 'Category not found.' });
    return;
  }
  broadcastChannelsSync();
  res.json({ ok: true });
});

app.post('/api/admin/channels', requireAdmin, (req, res) => {
  const name = (req.body.name as string)?.trim();
  if (!name) {
    res.status(400).json({ error: 'Channel name required.' });
    return;
  }
  const channel = db.createChannel({
    name,
    topic: req.body.topic,
    description: req.body.description,
    categoryId: req.body.categoryId ?? null,
  });
  broadcastChannelsSync();
  res.json(channel);
});

app.patch('/api/admin/channels/:id', requireAdmin, (req, res) => {
  const channel = db.updateChannel(paramId(req.params.id), req.body);
  if (!channel) {
    res.status(404).json({ error: 'Channel not found.' });
    return;
  }
  broadcastChannelsSync();
  res.json(channel);
});

app.delete('/api/admin/channels/:id', requireAdmin, (req, res) => {
  const channelId = paramId(req.params.id);
  if (!db.deleteChannel(channelId)) {
    res.status(404).json({ error: 'Channel not found.' });
    return;
  }
  broadcastChannelsSync();
  res.json({ ok: true });
});

app.delete('/api/admin/messages/:id', requireAdmin, (req, res) => {
  const messageId = paramId(req.params.id);
  const message = db.getMessageById(messageId);
  if (!message) {
    res.status(404).json({ error: 'Message not found.' });
    return;
  }
  const updated = db.softDeleteMessage(messageId);
  if (!updated) {
    res.status(404).json({ error: 'Message not found.' });
    return;
  }
  broadcast({ type: 'message_updated', payload: { message: updated } });
  res.json({ message: updated });
});

app.post('/api/admin/users/:id/ban', requireAdmin, (req: AuthedRequest, res) => {
  const userId = paramId(req.params.id);
  if (userId === req.userId) {
    res.status(400).json({ error: 'Cannot ban yourself.' });
    return;
  }
  const user = db.banUser(userId, req.body.reason);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  broadcast({ type: 'user_moderated', payload: { user, action: 'ban' } });
  res.json(user);
});

app.post('/api/admin/users/:id/timeout', requireAdmin, (req: AuthedRequest, res) => {
  const userId = paramId(req.params.id);
  if (userId === req.userId) {
    res.status(400).json({ error: 'Cannot timeout yourself.' });
    return;
  }
  const minutes = Number(req.body.minutes) || 10;
  const user = db.timeoutUser(userId, minutes, req.body.reason);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  broadcast({ type: 'user_moderated', payload: { user, action: 'timeout' } });
  res.json(user);
});

app.post('/api/admin/users/:id/unban', requireAdmin, (req, res) => {
  const user = db.unbanUser(paramId(req.params.id));
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  broadcast({ type: 'user_moderated', payload: { user, action: 'unban' } });
  res.json(user);
});

app.post('/api/admin/users/:id/end-session', requireAdmin, (req: AuthedRequest, res) => {
  const userId = paramId(req.params.id);
  if (userId === req.userId) {
    res.status(400).json({ error: 'Cannot end your own session.' });
    return;
  }
  const user = db.getUserById(userId);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  auth.revokeAllSessionsForUser(userId);
  kickUser(userId, 'Your session was ended by an administrator.');
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAuth, (req: AuthedRequest, res) => {
  const user = db.getUserById(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json(user);
});

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) res.status(404).json({ error: 'Not found' });
    });
  });
}

const server = createServer(app);
setupWebSocket(server);

server.listen(PORT, HOST, () => {
  console.log(`Breeze server running on http://localhost:${PORT}`);
  const lan = getLanAddresses();
  if (lan.length > 0) {
    console.log('LAN:');
    for (const ip of lan) console.log(`  http://${ip}:${PORT}`);
  }
});