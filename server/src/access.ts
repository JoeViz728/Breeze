import type { AccessLevel, ChannelAccessSetting } from './types.js';

export function normalizeAccess(
  readAccess: AccessLevel,
  writeAccess: AccessLevel,
): { readAccess: AccessLevel; writeAccess: AccessLevel } {
  if (readAccess === 'admin') return { readAccess: 'admin', writeAccess: 'admin' };
  if (writeAccess === 'admin') return { readAccess, writeAccess: 'admin' };
  return { readAccess: 'everyone', writeAccess: 'everyone' };
}

export function normalizeChannelStoredAccess(
  readAccess: ChannelAccessSetting,
  writeAccess: ChannelAccessSetting,
): { readAccess: ChannelAccessSetting; writeAccess: ChannelAccessSetting } {
  if (readAccess === 'admin') return { readAccess: 'admin', writeAccess: 'admin' };
  if (readAccess !== 'inherit' && writeAccess === 'admin') {
    return { readAccess, writeAccess: 'admin' };
  }
  return { readAccess, writeAccess };
}