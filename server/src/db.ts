import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AccessLevel, Category, Channel, Message, ServerInfo, ServerStats, User, UserRole } from './types.js';
import { normalizeAccess, normalizeChannelStoredAccess } from './access.js';
import { extractUserMentions, messagePingsUser } from './mentions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'breeze.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    avatar_color TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'offline',
    last_seen TEXT NOT NULL,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    banned_until TEXT,
    ban_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS server_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT 'Breeze',
    description TEXT NOT NULL DEFAULT 'A calm, self-hosted chat space.',
    onboarded INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    topic TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    category_id TEXT,
    read_access TEXT NOT NULL DEFAULT 'everyone',
    write_access TEXT NOT NULL DEFAULT 'everyone',
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    attachments TEXT NOT NULL DEFAULT '[]',
    link_previews TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

function migrate() {
  const cols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has('password_hash')) db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
  if (!colNames.has('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
  if (!colNames.has('banned_until')) db.exec('ALTER TABLE users ADD COLUMN banned_until TEXT');
  if (!colNames.has('ban_reason')) db.exec('ALTER TABLE users ADD COLUMN ban_reason TEXT');

  const chCols = db.prepare('PRAGMA table_info(channels)').all() as { name: string }[];
  if (!chCols.some((c) => c.name === 'category_id')) {
    db.exec('ALTER TABLE channels ADD COLUMN category_id TEXT');
  }
  if (!chCols.some((c) => c.name === 'read_access')) {
    db.exec("ALTER TABLE channels ADD COLUMN read_access TEXT NOT NULL DEFAULT 'everyone'");
  }
  if (!chCols.some((c) => c.name === 'write_access')) {
    db.exec("ALTER TABLE channels ADD COLUMN write_access TEXT NOT NULL DEFAULT 'everyone'");
  }

  const catCols = db.prepare('PRAGMA table_info(categories)').all() as { name: string }[];
  const addedCategoryAccess = !catCols.some((c) => c.name === 'read_access');
  if (addedCategoryAccess) {
    db.exec("ALTER TABLE categories ADD COLUMN read_access TEXT NOT NULL DEFAULT 'everyone'");
    db.exec("ALTER TABLE categories ADD COLUMN write_access TEXT NOT NULL DEFAULT 'everyone'");
    db.prepare(
      "UPDATE channels SET read_access = 'inherit', write_access = 'inherit' WHERE read_access = 'everyone' AND write_access = 'everyone'",
    ).run();
  } else if (!catCols.some((c) => c.name === 'write_access')) {
    db.exec("ALTER TABLE categories ADD COLUMN write_access TEXT NOT NULL DEFAULT 'everyone'");
  }

  const msgCols = db.prepare('PRAGMA table_info(messages)').all() as { name: string }[];
  if (!msgCols.some((c) => c.name === 'deleted')) {
    db.exec('ALTER TABLE messages ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
  }

  const settingsCols = db.prepare('PRAGMA table_info(server_settings)').all() as { name: string }[];
  const settingsColNames = new Set(settingsCols.map((c) => c.name));
  if (!settingsColNames.has('created_at')) db.exec('ALTER TABLE server_settings ADD COLUMN created_at TEXT');
  if (!settingsColNames.has('owner_id')) db.exec('ALTER TABLE server_settings ADD COLUMN owner_id TEXT');
  if (!settingsColNames.has('login_disabled')) {
    db.exec('ALTER TABLE server_settings ADD COLUMN login_disabled INTEGER NOT NULL DEFAULT 0');
  }
  if (!settingsColNames.has('login_notice')) {
    db.exec("ALTER TABLE server_settings ADD COLUMN login_notice TEXT NOT NULL DEFAULT ''");
  }
  if (!settingsColNames.has('uncategorized_read_access')) {
    db.exec("ALTER TABLE server_settings ADD COLUMN uncategorized_read_access TEXT NOT NULL DEFAULT 'everyone'");
  }
  if (!settingsColNames.has('uncategorized_write_access')) {
    db.exec("ALTER TABLE server_settings ADD COLUMN uncategorized_write_access TEXT NOT NULL DEFAULT 'everyone'");
  }

  const settings = db.prepare('SELECT COUNT(*) as count FROM server_settings').get() as { count: number };
  if (settings.count === 0) {
    const channelCount = db.prepare('SELECT COUNT(*) as count FROM channels').get() as { count: number };
    const onboarded = channelCount.count > 0 ? 1 : 0;
    db.prepare(
      'INSERT INTO server_settings (id, name, description, onboarded) VALUES (1, ?, ?, ?)'
    ).run('Breeze', 'A calm, self-hosted chat space.', onboarded);
  }

  const adminRow = db
    .prepare("SELECT id, last_seen FROM users WHERE role = 'admin' ORDER BY last_seen ASC LIMIT 1")
    .get() as { id: string; last_seen: string } | undefined;
  const earliestMsg = db.prepare('SELECT MIN(created_at) as t FROM messages').get() as { t: string | null };
  const backfillCreated = adminRow?.last_seen || earliestMsg.t || new Date().toISOString();
  db.prepare(
    'UPDATE server_settings SET created_at = COALESCE(created_at, ?), owner_id = COALESCE(owner_id, ?) WHERE id = 1'
  ).run(backfillCreated, adminRow?.id ?? null);
}

migrate();

const AVATAR_COLORS = ['#6B8F71', '#7B8FA1', '#A67C52', '#8B7FA8', '#5C8A8A', '#9B7B6B'];

function rowToUser(row: Record<string, unknown>, includePassword = false): User {
  const user: User = {
    id: row.id as string,
    username: row.username as string,
    avatarColor: row.avatar_color as string,
    role: (row.role as UserRole) || 'member',
    status: row.status as User['status'],
    lastSeen: row.last_seen as string,
    bannedUntil: (row.banned_until as string) || null,
    banReason: (row.ban_reason as string) || null,
  };
  if (includePassword && row.password_hash) {
    user.passwordHash = row.password_hash as string;
  }
  return user;
}

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as string,
    channelId: row.channel_id as string,
    userId: row.user_id as string,
    content: row.content as string,
    createdAt: row.created_at as string,
    attachments: JSON.parse(row.attachments as string),
    linkPreviews: JSON.parse(row.link_previews as string),
    deleted: !!(row.deleted as number | undefined),
  };
}

function publicUser(user: User): User {
  const { passwordHash: _, ...rest } = user;
  return rest;
}

export function needsOnboarding(): boolean {
  const row = db.prepare('SELECT onboarded FROM server_settings WHERE id = 1').get() as { onboarded: number } | undefined;
  return !row || row.onboarded === 0;
}

function resolveServerOwner(ownerId: string | null | undefined): ServerInfo['owner'] {
  if (ownerId) {
    const user = getUserById(ownerId);
    if (user) return { id: user.id, username: user.username };
  }
  const adminRow = db
    .prepare("SELECT id, username FROM users WHERE role = 'admin' ORDER BY last_seen ASC LIMIT 1")
    .get() as { id: string; username: string } | undefined;
  return adminRow ? { id: adminRow.id, username: adminRow.username } : null;
}

export function getServerInfo(): ServerInfo {
  const row = db.prepare('SELECT * FROM server_settings WHERE id = 1').get() as Record<string, unknown> | undefined;
  return {
    name: (row?.name as string) || 'Breeze',
    description: (row?.description as string) || 'A calm, self-hosted chat space.',
    onboarded: row?.onboarded === 1,
    createdAt: (row?.created_at as string) || null,
    owner: resolveServerOwner(row?.owner_id as string | undefined),
    loginDisabled: row?.login_disabled === 1,
    loginNotice: (row?.login_notice as string) || '',
    uncategorizedReadAccess:
      ((row?.uncategorized_read_access as AccessLevel) || 'everyone'),
    uncategorizedWriteAccess:
      ((row?.uncategorized_write_access as AccessLevel) || 'everyone'),
  };
}

export function updateServerInfo(
  data: Partial<
    Pick<
      ServerInfo,
      | 'name'
      | 'description'
      | 'loginDisabled'
      | 'loginNotice'
      | 'uncategorizedReadAccess'
      | 'uncategorizedWriteAccess'
    >
  >,
): ServerInfo {
  const current = getServerInfo();
  const name = data.name !== undefined ? data.name : current.name;
  const description = data.description !== undefined ? data.description : current.description;
  const loginDisabled = data.loginDisabled !== undefined ? (data.loginDisabled ? 1 : 0) : (current.loginDisabled ? 1 : 0);
  const loginNotice = data.loginNotice !== undefined ? data.loginNotice : current.loginNotice;
  const uncategorizedAccess = normalizeAccess(
    data.uncategorizedReadAccess !== undefined
      ? data.uncategorizedReadAccess
      : current.uncategorizedReadAccess,
    data.uncategorizedWriteAccess !== undefined
      ? data.uncategorizedWriteAccess
      : current.uncategorizedWriteAccess,
  );

  db.prepare(
    `UPDATE server_settings
     SET name = ?, description = ?, login_disabled = ?, login_notice = ?,
         uncategorized_read_access = ?, uncategorized_write_access = ?
     WHERE id = 1`,
  ).run(
    name,
    description,
    loginDisabled,
    loginNotice,
    uncategorizedAccess.readAccess,
    uncategorizedAccess.writeAccess,
  );
  return getServerInfo();
}

export function reorderCategories(orderedIds: string[]): Category[] {
  const tx = db.transaction(() => {
    orderedIds.forEach((id, position) => {
      db.prepare('UPDATE categories SET position = ? WHERE id = ?').run(position, id);
    });
  });
  tx();
  return getCategories();
}

export function reorderChannels(orderedIds: string[]): Channel[] {
  const tx = db.transaction(() => {
    orderedIds.forEach((id, position) => {
      db.prepare('UPDATE channels SET position = ? WHERE id = ?').run(position, id);
    });
  });
  tx();
  return getChannels();
}

export function updateChannelLayout(
  items: Array<{ id: string; categoryId: string | null; position: number }>,
): Channel[] {
  const tx = db.transaction(() => {
    for (const item of items) {
      db.prepare('UPDATE channels SET category_id = ?, position = ? WHERE id = ?').run(
        item.categoryId,
        item.position,
        item.id,
      );
    }
  });
  tx();
  return getChannels();
}

export function getUserIdsByRole(role: UserRole): string[] {
  return db
    .prepare('SELECT id FROM users WHERE role = ?')
    .all(role)
    .map((row) => (row as { id: string }).id);
}

export function createAdminUser(username: string, passwordHash: string, serverName: string): User {
  const now = new Date().toISOString();
  const userId = randomUUID();
  const avatarColor = AVATAR_COLORS[0];

  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO users (id, username, avatar_color, status, last_seen, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, username, avatarColor, 'online', now, passwordHash, 'admin');

    db.prepare('UPDATE server_settings SET name = ?, onboarded = 1, created_at = ?, owner_id = ? WHERE id = 1').run(
      serverName,
      now,
      userId
    );

    const categoryId = randomUUID();
    db.prepare('INSERT INTO categories (id, name, position) VALUES (?, ?, ?)').run(categoryId, 'General', 0);

    const channelId = randomUUID();
    db.prepare(
      'INSERT INTO channels (id, name, topic, description, position, category_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(channelId, 'general', 'Welcome to your server', 'Say hello and get started.', 0, categoryId);
  });

  tx();
  return getUserById(userId)!;
}

function rowToCategory(row: Record<string, unknown>): Category {
  const access = normalizeAccess(
    (row.read_access as AccessLevel) || 'everyone',
    (row.write_access as AccessLevel) || 'everyone',
  );
  return {
    id: row.id as string,
    name: row.name as string,
    position: row.position as number,
    readAccess: access.readAccess,
    writeAccess: access.writeAccess,
  };
}

export function getCategories(): Category[] {
  return db
    .prepare('SELECT * FROM categories ORDER BY position ASC')
    .all()
    .map((row) => rowToCategory(row as Record<string, unknown>));
}

function rowToChannel(row: Record<string, string | number | null>): Channel {
  return {
    id: row.id as string,
    name: row.name as string,
    topic: row.topic as string,
    description: row.description as string,
    position: row.position as number,
    categoryId: (row.category_id as string) || null,
    readAccess: (row.read_access as Channel['readAccess']) || 'inherit',
    writeAccess: (row.write_access as Channel['writeAccess']) || 'inherit',
  };
}

export function getChannels(): Channel[] {
  return db.prepare('SELECT * FROM channels ORDER BY position ASC').all().map((row) =>
    rowToChannel(row as Record<string, string | number | null>)
  );
}

export function getChannelById(id: string): Channel | null {
  const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as Record<string, string | number | null> | undefined;
  return row ? rowToChannel(row) : null;
}

export function getChannelMessageCount(channelId: string): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM messages WHERE channel_id = ?').get(channelId) as { count: number };
  return row.count;
}

export function getChannelUnreadSince(
  channelId: string,
  afterMessageId: string | null,
  user: User,
): { unreadCount: number; mentionCount: number } {
  const users = getUsers().map((u) => ({ id: u.id, username: u.username }));
  let rows: { content: string; user_id: string }[];

  if (afterMessageId) {
    const anchor = db
      .prepare('SELECT created_at FROM messages WHERE id = ? AND channel_id = ? AND deleted = 0')
      .get(afterMessageId, channelId) as { created_at: string } | undefined;
    if (!anchor) {
      rows = db
        .prepare(
          'SELECT content, user_id FROM messages WHERE channel_id = ? AND deleted = 0 ORDER BY created_at ASC'
        )
        .all(channelId) as { content: string; user_id: string }[];
    } else {
      rows = db
        .prepare(
          `SELECT content, user_id FROM messages
           WHERE channel_id = ? AND deleted = 0 AND created_at > ?
           ORDER BY created_at ASC`
        )
        .all(channelId, anchor.created_at) as { content: string; user_id: string }[];
    }
  } else {
    rows = db
      .prepare(
        'SELECT content, user_id FROM messages WHERE channel_id = ? AND deleted = 0 ORDER BY created_at ASC'
      )
      .all(channelId) as { content: string; user_id: string }[];
  }

  const fromOthers = rows.filter((row) => row.user_id !== user.id);
  let mentionCount = 0;
  for (const row of fromOthers) {
    if (messagePingsUser(row.content, user.id, user.role, users)) mentionCount++;
  }

  return { unreadCount: fromOthers.length, mentionCount };
}

export function getMessageCountForChannels(channelIds: string[]): number {
  if (channelIds.length === 0) return 0;
  const placeholders = channelIds.map(() => '?').join(',');
  const row = db
    .prepare(`SELECT COUNT(*) as count FROM messages WHERE channel_id IN (${placeholders})`)
    .get(...channelIds) as { count: number };
  return row.count;
}

export function searchMessages(query: string, channelIds: string[], limit = 50): Message[] {
  if (channelIds.length === 0) return [];
  const placeholders = channelIds.map(() => '?').join(',');
  const pattern = `%${query}%`;
  const rows = db
    .prepare(
      `SELECT * FROM messages WHERE channel_id IN (${placeholders}) AND deleted = 0 AND content LIKE ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(...channelIds, pattern, limit);
  return rows.map((row) => rowToMessage(row as Record<string, unknown>));
}

export function getUsers(): User[] {
  return db.prepare('SELECT * FROM users ORDER BY username ASC').all().map((row) => publicUser(rowToUser(row as Record<string, unknown>)));
}

export function getUserById(id: string): User | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? publicUser(rowToUser(row)) : null;
}

export function getUserByUsername(username: string): User | null {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as Record<string, unknown> | undefined;
  return row ? rowToUser(row, true) : null;
}

export function createGuestUser(username: string): User {
  const id = randomUUID();
  const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO users (id, username, avatar_color, status, last_seen, role) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, username, avatarColor, 'online', now, 'member');
  return getUserById(id)!;
}

export function setUserStatus(userId: string, status: User['status']) {
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET status = ?, last_seen = ? WHERE id = ?').run(status, now, userId);
}

export function markAllUsersOffline() {
  db.prepare("UPDATE users SET status = 'offline' WHERE status != 'offline'").run();
}

export function getMessages(channelId: string, limit = 100): Message[] {
  const rows = db
    .prepare('SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at ASC LIMIT ?')
    .all(channelId, limit);
  return rows.map((row) => rowToMessage(row as Record<string, unknown>));
}

export function getMessageById(id: string): Message | null {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToMessage(row) : null;
}

export function createMessage(
  channelId: string,
  userId: string,
  content: string,
  attachments: Message['attachments'] = [],
  linkPreviews: Message['linkPreviews'] = []
): Message {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    'INSERT INTO messages (id, channel_id, user_id, content, created_at, attachments, link_previews) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, channelId, userId, content, createdAt, JSON.stringify(attachments), JSON.stringify(linkPreviews));
  return { id, channelId, userId, content, createdAt, attachments, linkPreviews };
}

export function softDeleteMessage(id: string): Message | null {
  const result = db.prepare('UPDATE messages SET deleted = 1 WHERE id = ? AND deleted = 0').run(id);
  if (result.changes === 0) return null;
  return getMessageById(id);
}

export function createCategory(name: string): Category {
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) as max FROM categories').get() as { max: number };
  const id = randomUUID();
  db.prepare('INSERT INTO categories (id, name, position, read_access, write_access) VALUES (?, ?, ?, ?, ?)').run(
    id,
    name,
    maxPos.max + 1,
    'everyone',
    'everyone',
  );
  return getCategoryById(id)!;
}

export function getCategoryById(id: string): Category | null {
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToCategory(row) : null;
}

export function updateCategory(
  id: string,
  data: Partial<Pick<Category, 'name' | 'readAccess' | 'writeAccess'>>,
): Category | null {
  const existing = getCategoryById(id);
  if (!existing) return null;

  const name = data.name !== undefined ? data.name : existing.name;
  const access = normalizeAccess(
    data.readAccess !== undefined ? data.readAccess : existing.readAccess,
    data.writeAccess !== undefined ? data.writeAccess : existing.writeAccess,
  );

  db.prepare('UPDATE categories SET name = ?, read_access = ?, write_access = ? WHERE id = ?').run(
    name,
    access.readAccess,
    access.writeAccess,
    id,
  );

  return getCategoryById(id);
}

export function deleteCategory(id: string): boolean {
  db.prepare('UPDATE channels SET category_id = NULL WHERE category_id = ?').run(id);
  const result = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return result.changes > 0;
}

export function createChannel(data: {
  name: string;
  topic?: string;
  description?: string;
  categoryId?: string | null;
  readAccess?: Channel['readAccess'];
  writeAccess?: Channel['writeAccess'];
}): Channel {
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) as max FROM channels').get() as { max: number };
  const id = randomUUID();
  const name = data.name.toLowerCase().replace(/\s+/g, '-').slice(0, 32);
  const access = normalizeChannelStoredAccess(data.readAccess || 'inherit', data.writeAccess || 'inherit');
  db.prepare(
    'INSERT INTO channels (id, name, topic, description, position, category_id, read_access, write_access) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    name,
    data.topic || '',
    data.description || '',
    maxPos.max + 1,
    data.categoryId || null,
    access.readAccess,
    access.writeAccess
  );
  return getChannelById(id)!;
}

export function updateChannel(
  id: string,
  data: Partial<Pick<Channel, 'name' | 'topic' | 'description' | 'categoryId' | 'position' | 'readAccess' | 'writeAccess'>>
): Channel | null {
  const existing = getChannelById(id);
  if (!existing) return null;

  const name = data.name !== undefined ? data.name.toLowerCase().replace(/\s+/g, '-').slice(0, 32) : existing.name;
  const topic = data.topic !== undefined ? data.topic : existing.topic;
  const description = data.description !== undefined ? data.description : existing.description;
  const categoryId = data.categoryId !== undefined ? data.categoryId : existing.categoryId;
  const position = data.position !== undefined ? data.position : existing.position;
  const access = normalizeChannelStoredAccess(
    data.readAccess !== undefined ? data.readAccess : existing.readAccess,
    data.writeAccess !== undefined ? data.writeAccess : existing.writeAccess,
  );

  db.prepare(
    'UPDATE channels SET name = ?, topic = ?, description = ?, category_id = ?, position = ?, read_access = ?, write_access = ? WHERE id = ?'
  ).run(name, topic, description, categoryId, position, access.readAccess, access.writeAccess, id);

  return getChannelById(id);
}

export function deleteChannel(id: string): boolean {
  const result = db.prepare('DELETE FROM channels WHERE id = ?').run(id);
  return result.changes > 0;
}

export function banUser(userId: string, reason?: string): User | null {
  const until = new Date('2099-12-31').toISOString();
  db.prepare('UPDATE users SET banned_until = ?, ban_reason = ?, status = ? WHERE id = ?').run(
    until,
    reason || 'Banned by an administrator.',
    'offline',
    userId
  );
  return getUserById(userId);
}

export function timeoutUser(userId: string, minutes: number, reason?: string): User | null {
  const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  db.prepare('UPDATE users SET banned_until = ?, ban_reason = ?, status = ? WHERE id = ?').run(
    until,
    reason || `Timed out for ${minutes} minutes.`,
    'offline',
    userId
  );
  return getUserById(userId);
}

export function unbanUser(userId: string): User | null {
  db.prepare('UPDATE users SET banned_until = NULL, ban_reason = NULL WHERE id = ?').run(userId);
  return getUserById(userId);
}

export function getMediaAndLinks(channelId?: string, channelIds?: string[]) {
  let rows: Record<string, unknown>[];
  if (channelId) {
    rows = db.prepare('SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at DESC').all(channelId) as Record<string, unknown>[];
  } else if (channelIds && channelIds.length > 0) {
    const placeholders = channelIds.map(() => '?').join(',');
    rows = db
      .prepare(`SELECT * FROM messages WHERE channel_id IN (${placeholders}) ORDER BY created_at DESC`)
      .all(...channelIds) as Record<string, unknown>[];
  } else {
    rows = [];
  }

  const media: Array<{ messageId: string; channelId: string; attachment: Message['attachments'][0]; createdAt: string }> = [];
  const links: Array<{ messageId: string; channelId: string; preview: Message['linkPreviews'][0]; createdAt: string }> = [];

  for (const row of rows) {
    const msg = rowToMessage(row as Record<string, unknown>);
    if (msg.deleted) continue;
    for (const att of msg.attachments) {
      media.push({ messageId: msg.id, channelId: msg.channelId, attachment: att, createdAt: msg.createdAt });
    }
    for (const preview of msg.linkPreviews) {
      links.push({ messageId: msg.id, channelId: msg.channelId, preview, createdAt: msg.createdAt });
    }
  }

  return { media, links };
}

export function isAdmin(userId: string): boolean {
  const user = getUserById(userId);
  return user?.role === 'admin';
}

function isUserBanned(user: User): boolean {
  if (!user.bannedUntil) return false;
  return new Date(user.bannedUntil).getTime() > Date.now();
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our',
  'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'way',
  'who', 'did', 'let', 'say', 'she', 'too', 'use', 'that', 'this', 'with', 'from', 'have', 'been',
  'what', 'when', 'your', 'they', 'will', 'just', 'like', 'know', 'take', 'come', 'than', 'them',
  'then', 'some', 'into', 'only', 'over', 'such', 'also', 'back', 'here', 'well', 'very', 'much',
]);

function getMentionStats(): {
  mainCharacter: { username: string; mentionCount: number } | null;
  pingAbuser: { username: string; mentionCount: number } | null;
} {
  const users = getUsers().map((u) => ({ id: u.id, username: u.username }));
  const usernameById = new Map(users.map((u) => [u.id, u.username]));
  const rows = db
    .prepare('SELECT user_id, content FROM messages WHERE deleted = 0')
    .all() as { user_id: string; content: string }[];

  const mentionedCounts = new Map<string, number>();
  const outgoingCounts = new Map<string, number>();

  for (const row of rows) {
    const mentions = extractUserMentions(row.content, users);
    if (mentions.length > 0) {
      outgoingCounts.set(row.user_id, (outgoingCounts.get(row.user_id) || 0) + mentions.length);
    }
    for (const { userId } of mentions) {
      mentionedCounts.set(userId, (mentionedCounts.get(userId) || 0) + 1);
    }
  }

  let mainCharacter: { username: string; mentionCount: number } | null = null;
  for (const [userId, count] of mentionedCounts) {
    const username = usernameById.get(userId);
    if (!username) continue;
    if (!mainCharacter || count > mainCharacter.mentionCount) {
      mainCharacter = { username, mentionCount: count };
    }
  }

  let pingAbuser: { username: string; mentionCount: number } | null = null;
  for (const [userId, count] of outgoingCounts) {
    const username = usernameById.get(userId);
    if (!username) continue;
    if (!pingAbuser || count > pingAbuser.mentionCount) {
      pingAbuser = { username, mentionCount: count };
    }
  }

  return { mainCharacter, pingAbuser };
}

function getNovelAuthor(): { username: string; charCount: number } | null {
  const row = db
    .prepare(
      `SELECT u.username, LENGTH(m.content) as charCount
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.deleted = 0
       ORDER BY charCount DESC
       LIMIT 1`
    )
    .get() as { username: string; charCount: number } | undefined;
  return row ? { username: row.username, charCount: row.charCount } : null;
}

const MIN_SPEED_REPLIES = 3;
const MAX_REPLY_GAP_MS = 24 * 60 * 60 * 1000;

function getSpeedReplyDemon(): { username: string; avgMs: number; replyCount: number } | null {
  const rows = db
    .prepare(
      `SELECT m.channel_id, m.user_id, u.username, m.created_at
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.deleted = 0
       ORDER BY m.channel_id, m.created_at`
    )
    .all() as { channel_id: string; user_id: string; username: string; created_at: string }[];

  const totals = new Map<string, { username: string; sum: number; count: number }>();
  const lastByChannel = new Map<string, { userId: string; createdAt: string }>();

  for (const row of rows) {
    const prev = lastByChannel.get(row.channel_id);
    if (prev && prev.userId !== row.user_id) {
      const latency = new Date(row.created_at).getTime() - new Date(prev.createdAt).getTime();
      if (latency > 0 && latency <= MAX_REPLY_GAP_MS) {
        const entry = totals.get(row.user_id) ?? { username: row.username, sum: 0, count: 0 };
        entry.sum += latency;
        entry.count += 1;
        totals.set(row.user_id, entry);
      }
    }
    lastByChannel.set(row.channel_id, { userId: row.user_id, createdAt: row.created_at });
  }

  let best: { username: string; avgMs: number; replyCount: number } | null = null;
  for (const entry of totals.values()) {
    if (entry.count < MIN_SPEED_REPLIES) continue;
    const avgMs = entry.sum / entry.count;
    if (!best || avgMs < best.avgMs) {
      best = { username: entry.username, avgMs, replyCount: entry.count };
    }
  }
  return best;
}

function getTopWord(): { word: string; count: number } | null {
  const rows = db.prepare('SELECT content FROM messages WHERE deleted = 0').all() as { content: string }[];
  if (rows.length === 0) return null;

  const counts = new Map<string, number>();
  for (const { content } of rows) {
    const cleaned = content
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/@[\w-]+/g, ' ')
      .replace(/#[\w-]+/g, ' ')
      .replace(/[^\w\s]/g, ' ')
      .toLowerCase();
    for (const word of cleaned.split(/\s+/)) {
      if (word.length < 3 || STOP_WORDS.has(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }

  let top: { word: string; count: number } | null = null;
  for (const [word, count] of counts) {
    if (!top || count > top.count) top = { word, count };
  }
  return top;
}

export function getServerStats(
  readableChannelIds: string[],
  uptimeMs: number,
  serverStartedAt: string,
): ServerStats {
  const topYapperRow = db
    .prepare(
      `SELECT u.username, COUNT(*) as count
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.deleted = 0
       GROUP BY m.user_id
       ORDER BY count DESC
       LIMIT 1`
    )
    .get() as { username: string; count: number } | undefined;

  const popularChannelRow = db
    .prepare(
      `SELECT c.name, COUNT(*) as count
       FROM messages m
       JOIN channels c ON m.channel_id = c.id
       WHERE m.deleted = 0
       GROUP BY m.channel_id
       ORDER BY count DESC
       LIMIT 1`
    )
    .get() as { name: string; count: number } | undefined;

  const peakHourRow = db
    .prepare(
      `SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as count
       FROM messages
       WHERE deleted = 0
       GROUP BY hour
       ORDER BY count DESC
       LIMIT 1`
    )
    .get() as { hour: number; count: number } | undefined;

  const membersOnline = getUsers().filter((u) => u.status === 'online' && !isUserBanned(u)).length;
  const { mainCharacter, pingAbuser } = getMentionStats();

  return {
    server: getServerInfo(),
    channelCount: readableChannelIds.length,
    memberCount: getUsers().length,
    messageCount: getMessageCountForChannels(readableChannelIds),
    serverStartedAt,
    uptimeMs,
    membersOnline,
    topYapper: topYapperRow ? { username: topYapperRow.username, messageCount: topYapperRow.count } : null,
    mostPopularChannel: popularChannelRow
      ? { name: popularChannelRow.name, messageCount: popularChannelRow.count }
      : null,
    peakHour: peakHourRow ? { hour: peakHourRow.hour, messageCount: peakHourRow.count } : null,
    topWord: getTopWord(),
    mainCharacter,
    pingAbuser,
    novelAuthor: getNovelAuthor(),
    speedReplyDemon: getSpeedReplyDemon(),
  };
}

export default db;