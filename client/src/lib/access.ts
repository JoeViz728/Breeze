import type { AccessLevel } from '../types';

export function normalizeAccess(
  readAccess: AccessLevel,
  writeAccess: AccessLevel,
): { readAccess: AccessLevel; writeAccess: AccessLevel } {
  if (readAccess === 'admin') return { readAccess: 'admin', writeAccess: 'admin' };
  if (writeAccess === 'admin') return { readAccess, writeAccess: 'admin' };
  return { readAccess: 'everyone', writeAccess: 'everyone' };
}