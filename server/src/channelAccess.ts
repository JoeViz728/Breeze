import { normalizeAccess } from './access.js';
import * as db from './db.js';
import type { AccessLevel, Category, Channel } from './types.js';

export function getUncategorizedAccess(): { readAccess: AccessLevel; writeAccess: AccessLevel } {
  const server = db.getServerInfo();
  return normalizeAccess(server.uncategorizedReadAccess, server.uncategorizedWriteAccess);
}

export function resolveParentAccess(
  categoryId: string | null,
  categories: Category[],
): { readAccess: AccessLevel; writeAccess: AccessLevel } {
  if (!categoryId) return getUncategorizedAccess();
  const category = categories.find((entry) => entry.id === categoryId);
  if (!category) return getUncategorizedAccess();
  return normalizeAccess(category.readAccess, category.writeAccess);
}

export function resolveChannelAccess(
  channel: Channel,
  categories: Category[] = db.getCategories(),
): { readAccess: AccessLevel; writeAccess: AccessLevel } {
  const parent = resolveParentAccess(channel.categoryId, categories);
  const readAccess = channel.readAccess === 'inherit' ? parent.readAccess : channel.readAccess;
  const writeAccess = channel.writeAccess === 'inherit' ? parent.writeAccess : channel.writeAccess;
  return normalizeAccess(readAccess, writeAccess);
}