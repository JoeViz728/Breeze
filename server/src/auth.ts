import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import type { User } from './types.js';
import * as db from './db.js';

const scryptAsync = promisify(scrypt);
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Session {
  userId: string;
  expiresAt: number;
}

const sessions = new Map<string, Session>();

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const hashBuf = Buffer.from(hash, 'hex');
  if (derived.length !== hashBuf.length) return false;
  return timingSafeEqual(derived, hashBuf);
}

export function createSession(userId: string): string {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function getSessionUserId(token: string | undefined): string | null {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session.userId;
}

export function revokeSession(token: string) {
  sessions.delete(token);
}

export function revokeAllSessionsForUser(userId: string): number {
  let count = 0;
  for (const [token, session] of sessions) {
    if (session.userId === userId) {
      sessions.delete(token);
      count++;
    }
  }
  return count;
}

export function isUserBanned(user: User): boolean {
  if (!user.bannedUntil) return false;
  return new Date(user.bannedUntil).getTime() > Date.now();
}

export function getBanMessage(user: User): string {
  if (!user.banReason) return 'You are banned from this server.';
  return user.banReason;
}

export async function authenticateWithPassword(username: string, password: string): Promise<{ user: User; token: string } | null> {
  const row = db.getUserByUsername(username);
  if (!row?.passwordHash) return null;
  const valid = await verifyPassword(password, row.passwordHash);
  if (!valid) return null;
  if (isUserBanned(row)) return null;
  const token = createSession(row.id);
  return { user: row, token };
}

export function authenticateWithToken(token: string): User | null {
  const userId = getSessionUserId(token);
  if (!userId) return null;
  const user = db.getUserById(userId);
  if (!user || isUserBanned(user)) return null;
  return user;
}

export function authenticateGuest(username: string): { user: User; token: string } | null {
  const trimmed = username.trim();
  if (trimmed.length < 2 || trimmed.length > 24) return null;

  const existing = db.getUserByUsername(trimmed);
  if (existing?.passwordHash) return null;
  if (existing && isUserBanned(existing)) return null;

  const user = existing ?? db.createGuestUser(trimmed);
  if (isUserBanned(user)) return null;

  const token = createSession(user.id);
  return { user, token };
}

export function userRequiresPassword(username: string): boolean {
  const user = db.getUserByUsername(username.trim());
  return !!user?.passwordHash;
}