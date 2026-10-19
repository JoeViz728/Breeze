import type { AccessLevel, Category, Channel, ChannelAccessSetting, ServerInfo } from '../types';
import { normalizeAccess } from './access';

export type AccessParents = {
  categories: Category[];
  uncategorizedAccess: { readAccess: AccessLevel; writeAccess: AccessLevel };
};

export function accessParentsFrom(
  server: Pick<ServerInfo, 'uncategorizedReadAccess' | 'uncategorizedWriteAccess'>,
  categories: Category[],
): AccessParents {
  return {
    categories,
    uncategorizedAccess: normalizeAccess(
      server.uncategorizedReadAccess ?? 'everyone',
      server.uncategorizedWriteAccess ?? 'everyone',
    ),
  };
}

export function resolveParentAccess(
  categoryId: string | null,
  parents: AccessParents,
): { readAccess: AccessLevel; writeAccess: AccessLevel } {
  if (!categoryId) return parents.uncategorizedAccess;
  const category = parents.categories.find((entry) => entry.id === categoryId);
  if (!category) return parents.uncategorizedAccess;
  return normalizeAccess(category.readAccess, category.writeAccess);
}

export function resolveChannelAccess(
  channel: Channel,
  parents: AccessParents,
): { readAccess: AccessLevel; writeAccess: AccessLevel } {
  const parent = resolveParentAccess(channel.categoryId, parents);
  const readAccess = channel.readAccess === 'inherit' ? parent.readAccess : channel.readAccess;
  const writeAccess = channel.writeAccess === 'inherit' ? parent.writeAccess : channel.writeAccess;
  return normalizeAccess(readAccess, writeAccess);
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