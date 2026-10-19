import type { Category, Channel } from '../types';

export const UNCATEGORIZED_LABEL = '(Uncategorized)';

export type ChannelLayoutItem = {
  id: string;
  categoryId: string | null;
  position: number;
};

export type SettingsLayoutRow =
  | { kind: 'section'; categoryId: string | null; label: string }
  | { kind: 'channel'; channel: Channel };

export type LayoutMoveTarget =
  | { type: 'channel'; id: string }
  | { type: 'category'; id: string };

export function sortByPosition<T extends { position: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

export function channelsInCategory(channels: Channel[], categoryId: string | null): Channel[] {
  return sortByPosition(channels.filter((channel) => channel.categoryId === categoryId));
}

export function buildGlobalChannelOrder(categories: Category[], channels: Channel[]): string[] {
  const ordered: string[] = [];
  ordered.push(...channelsInCategory(channels, null).map((channel) => channel.id));
  for (const category of sortByPosition(categories)) {
    ordered.push(...channelsInCategory(channels, category.id).map((channel) => channel.id));
  }
  return ordered;
}

export function buildSettingsLayoutRows(categories: Category[], channels: Channel[]): SettingsLayoutRow[] {
  const rows: SettingsLayoutRow[] = [
    { kind: 'section', categoryId: null, label: UNCATEGORIZED_LABEL },
    ...channelsInCategory(channels, null).map(
      (channel): SettingsLayoutRow => ({ kind: 'channel', channel }),
    ),
  ];

  for (const category of sortByPosition(categories)) {
    rows.push({ kind: 'section', categoryId: category.id, label: category.name });
    for (const channel of channelsInCategory(channels, category.id)) {
      rows.push({ kind: 'channel', channel });
    }
  }

  return rows;
}

function isPinnedSection(row: SettingsLayoutRow): boolean {
  return row.kind === 'section' && row.categoryId === null;
}

export function arrangeableRowIndices(rows: SettingsLayoutRow[]): number[] {
  return rows
    .map((row, index) => (!isPinnedSection(row) ? index : -1))
    .filter((index) => index >= 0);
}

function findArrangeableRowIndex(rows: SettingsLayoutRow[], target: LayoutMoveTarget): number {
  if (target.type === 'channel') {
    return rows.findIndex((row) => row.kind === 'channel' && row.channel.id === target.id);
  }
  return rows.findIndex((row) => row.kind === 'section' && row.categoryId === target.id);
}

export function layoutRowMoveBounds(rows: SettingsLayoutRow[], target: LayoutMoveTarget) {
  const indices = arrangeableRowIndices(rows);
  const rowIndex = findArrangeableRowIndex(rows, target);
  const position = indices.indexOf(rowIndex);
  return {
    canMoveUp: position > 0,
    canMoveDown: position >= 0 && position < indices.length - 1,
  };
}

export function moveLayoutRow(
  rows: SettingsLayoutRow[],
  target: LayoutMoveTarget,
  direction: -1 | 1,
): SettingsLayoutRow[] | null {
  const indices = arrangeableRowIndices(rows);
  const rowIndex = findArrangeableRowIndex(rows, target);
  if (rowIndex < 0) return null;

  const position = indices.indexOf(rowIndex);
  const swapPosition = position + direction;
  if (swapPosition < 0 || swapPosition >= indices.length) return null;

  const swapIndex = indices[swapPosition];
  const next = [...rows];
  [next[rowIndex], next[swapIndex]] = [next[swapIndex], next[rowIndex]];
  return next;
}

export function categoryOrderFromSettingsRows(rows: SettingsLayoutRow[]): string[] {
  return rows
    .filter(
      (row): row is Extract<SettingsLayoutRow, { kind: 'section' }> =>
        row.kind === 'section' && row.categoryId !== null,
    )
    .map((row) => row.categoryId!);
}

export function layoutFromSettingsRows(rows: SettingsLayoutRow[]): ChannelLayoutItem[] {
  const items: ChannelLayoutItem[] = [];
  let currentCategoryId: string | null = null;
  const positions = new Map<string, number>();

  for (const row of rows) {
    if (row.kind === 'section') {
      currentCategoryId = row.categoryId;
      continue;
    }

    const key = currentCategoryId ?? '__uncategorized__';
    const position = positions.get(key) ?? 0;
    positions.set(key, position + 1);
    items.push({
      id: row.channel.id,
      categoryId: currentCategoryId,
      position,
    });
  }

  return items;
}