import { resolveChannelAccess } from './channelAccess.js';
import type { Channel, User, UserRole } from './types.js';
import * as db from './db.js';

export function canReadChannel(channel: Channel, role: UserRole): boolean {
  if (role === 'admin') return true;
  const { readAccess } = resolveChannelAccess(channel);
  return readAccess === 'everyone';
}

export function canWriteChannel(channel: Channel, role: UserRole): boolean {
  if (role === 'admin') return true;
  if (!canReadChannel(channel, role)) return false;
  const { writeAccess } = resolveChannelAccess(channel);
  return writeAccess === 'everyone';
}

export function filterReadableChannels(channels: Channel[], user: User | null): Channel[] {
  if (!user) {
    return channels.filter((channel) => resolveChannelAccess(channel).readAccess === 'everyone');
  }
  return channels.filter((channel) => canReadChannel(channel, user.role));
}

export function getChannelIfAllowed(channelId: string, user: User | null): Channel | null {
  const channel = db.getChannelById(channelId);
  if (!channel) return null;
  if (!user) return resolveChannelAccess(channel).readAccess === 'everyone' ? channel : null;
  return canReadChannel(channel, user.role) ? channel : null;
}