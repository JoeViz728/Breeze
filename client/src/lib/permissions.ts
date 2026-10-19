import type { AccessLevel, Channel, User, UserRole } from '../types';
import { type AccessParents, resolveChannelAccess } from './channelAccess';

export function visibleChannels(
  channels: Channel[],
  role: UserRole,
  parents: AccessParents,
): Channel[] {
  return channels.filter((channel) => canReadChannel(channel, role, parents));
}

export function canReadChannel(channel: Channel, role: UserRole, parents: AccessParents): boolean {
  if (role === 'admin') return true;
  const { readAccess } = resolveChannelAccess(channel, parents);
  return readAccess === 'everyone';
}

export function canWriteChannel(channel: Channel, role: UserRole, parents: AccessParents): boolean {
  if (role === 'admin') return true;
  if (!canReadChannel(channel, role, parents)) return false;
  const { writeAccess } = resolveChannelAccess(channel, parents);
  return writeAccess === 'everyone';
}

export const INHERIT_ACCESS_LABEL = '(Inherit)';

export function accessLabel(read: AccessLevel, write: AccessLevel): string {
  if (read === 'admin') return 'Admin only';
  if (write === 'admin') return 'Read-only';
  return 'Public';
}

export function channelAccessLabel(channel: Channel, parents: AccessParents): string {
  const resolved = resolveChannelAccess(channel, parents);
  if (channel.readAccess === 'inherit' || channel.writeAccess === 'inherit') {
    return `${INHERIT_ACCESS_LABEL} · ${accessLabel(resolved.readAccess, resolved.writeAccess)}`;
  }
  return accessLabel(resolved.readAccess, resolved.writeAccess);
}

export function isUserBanned(user: Pick<User, 'bannedUntil'>): boolean {
  return !!user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now();
}

export function isIndefiniteBan(bannedUntil: string): boolean {
  return new Date(bannedUntil).getFullYear() >= 2090;
}

export function formatBanTimeLeft(bannedUntil: string): string | null {
  if (isIndefiniteBan(bannedUntil)) return null;
  const ms = new Date(bannedUntil).getTime() - Date.now();
  if (ms <= 0) return null;

  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 24) return `${hours}h`;

  const days = Math.ceil(ms / 86_400_000);
  return `${days}d`;
}

export function isMemberOnline(user: User): boolean {
  return user.status === 'online' && !isUserBanned(user);
}

export function isReadOnlyInChannel(channel: Channel, role: UserRole, parents: AccessParents): boolean {
  return canReadChannel(channel, role, parents) && !canWriteChannel(channel, role, parents);
}

export function shouldShowChannelReadOnlyIcon(
  channel: Channel,
  role: UserRole,
  parents: AccessParents,
  isAdmin = role === 'admin',
): boolean {
  if (isAdmin) return false;
  return isReadOnlyInChannel(channel, role, parents);
}