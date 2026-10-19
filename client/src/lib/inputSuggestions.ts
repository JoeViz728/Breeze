import { filterCodeFenceLanguages } from './codeFenceLanguages';
import { getMarkupInputContext, type MarkupInputContext } from './markupInput';
import { matchesMentionQuery } from './mentions';
import { canReadChannel } from './permissions';
import {
  filterSlashCommands,
  resolveSlashInsert,
  slashCommandCategoryLabel,
  type SlashCommand,
} from './slashCommands';
import type { AccessParents } from './channelAccess';
import type { Channel, User, UserRole } from '../types';

export type SuggestionTrigger = '@' | '#';

export type SuggestionKind = 'user' | 'role' | 'channel' | 'markup' | 'slash';

export interface SuggestionItem {
  id: string;
  kind: SuggestionKind;
  label: string;
  insertText: string;
  subtitle?: string;
  description?: string;
  avatarColor?: string;
  syntax?: string;
  slashCommand?: SlashCommand;
}

export interface ActiveMention {
  trigger: SuggestionTrigger;
  query: string;
  start: number;
  end: number;
}

export interface ActiveSlash {
  query: string;
  start: number;
  end: number;
}

export type ActiveInputContext =
  | { type: 'mention'; mention: ActiveMention }
  | { type: 'slash'; slash: ActiveSlash }
  | { type: 'markup'; context: MarkupInputContext; start: number; end: number };

const ROLE_SUGGESTIONS: SuggestionItem[] = [
  { id: 'role:admin', kind: 'role', label: 'Admin', insertText: 'admin', subtitle: 'Role' },
  { id: 'role:member', kind: 'role', label: 'Member', insertText: 'member', subtitle: 'Role' },
];

function getActiveMention(text: string, cursor: number): ActiveMention | null {
  const before = text.slice(0, cursor);
  const match = /(^|[\s\n])([@#])([^@#]*)$/.exec(before);
  if (!match) return null;

  const trigger = match[2] as SuggestionTrigger;
  const query = match[3];
  const start = before.length - trigger.length - query.length;

  return { trigger, query, start, end: cursor };
}

function getActiveSlash(text: string, cursor: number): ActiveSlash | null {
  const before = text.slice(0, cursor);
  const match = /(^|[\s\n])(\/)([a-z0-9-]*)$/i.exec(before);
  if (!match) return null;

  const query = match[3];
  const start = before.length - 1 - query.length;

  return { query, start, end: cursor };
}

export function getActiveInputContext(text: string, cursor: number): ActiveInputContext | null {
  const mention = getActiveMention(text, cursor);
  if (mention) return { type: 'mention', mention };

  const slash = getActiveSlash(text, cursor);
  if (slash) return { type: 'slash', slash };

  const markup = getMarkupInputContext(text, cursor);
  if (markup) return { type: 'markup', context: markup, start: cursor, end: cursor };

  return null;
}

/** @deprecated Use getActiveInputContext */
export function getActiveSuggestion(text: string, cursor: number): ActiveMention | null {
  return getActiveMention(text, cursor);
}

function buildMentionSuggestions(
  trigger: SuggestionTrigger,
  query: string,
  users: User[],
  channels: Channel[],
  accessParents: AccessParents,
  userRole: UserRole,
): SuggestionItem[] {
  if (trigger === '@') {
    const roles = ROLE_SUGGESTIONS.filter(
      (r) => matchesMentionQuery(r.insertText, query) || matchesMentionQuery(r.label, query),
    );
    const members = users
      .filter((u) => matchesMentionQuery(u.username, query))
      .map((u) => ({
        id: `user:${u.id}`,
        kind: 'user' as const,
        label: u.username,
        insertText: u.username,
        subtitle: u.role === 'admin' ? 'Admin' : undefined,
        avatarColor: u.avatarColor,
      }));
    return [...roles, ...members].slice(0, 8);
  }

  return channels
    .filter((c) => canReadChannel(c, userRole, accessParents) && matchesMentionQuery(c.name, query))
    .map((c) => ({
      id: `channel:${c.id}`,
      kind: 'channel' as const,
      label: c.name,
      insertText: c.name,
      subtitle: 'Channel',
    }))
    .slice(0, 8);
}

function buildSlashSuggestions(query: string): SuggestionItem[] {
  return filterSlashCommands(query).map((command) => ({
    id: `slash:${command.id}`,
    kind: 'slash' as const,
    label: `/${command.name}`,
    insertText: command.insertText,
    subtitle: slashCommandCategoryLabel(command),
    description: command.description,
    syntax: command.syntax,
    slashCommand: command,
  }));
}

function buildCodeFenceLanguageSuggestions(query: string): SuggestionItem[] {
  return filterCodeFenceLanguages(query).map((language) => ({
    id: `code-lang:${language.id}`,
    kind: 'markup' as const,
    label: language.label,
    subtitle: 'Code block language',
    description: language.description,
    insertText: language.insertText,
    syntax: language.id === 'none' ? '∅' : language.id,
  }));
}

function buildMarkupSuggestions(context: MarkupInputContext): SuggestionItem[] {
  if (context.kind === 'code_fence_header' && context.codeFence) {
    return buildCodeFenceLanguageSuggestions(context.codeFence.languageQuery);
  }

  if (context.closeText) {
    return [
      {
        id: `markup:close:${context.kind}`,
        kind: 'markup',
        label: context.label,
        subtitle: `${context.hint} · Tab inserts ${context.closeText}`,
        insertText: context.closeText,
        syntax: context.syntax ?? context.closeText,
      },
    ];
  }

  return [
    {
      id: `markup:${context.kind}`,
      kind: 'markup',
      label: context.label,
      subtitle: context.hint,
      insertText: '',
      syntax: context.syntax,
    },
  ];
}

export function buildSuggestions(
  active: ActiveInputContext,
  users: User[],
  channels: Channel[],
  accessParents: AccessParents,
  userRole: UserRole,
): SuggestionItem[] {
  if (active.type === 'mention') {
    const { trigger, query } = active.mention;
    return buildMentionSuggestions(trigger, query, users, channels, accessParents, userRole);
  }
  if (active.type === 'slash') {
    return buildSlashSuggestions(active.slash.query);
  }
  return buildMarkupSuggestions(active.context);
}

export function applySuggestion(
  text: string,
  active: ActiveInputContext,
  item: SuggestionItem,
): { text: string; cursor: number } {
  if (active.type === 'markup') {
    if (!item.insertText) {
      return { text, cursor: active.end };
    }

    if (active.context.kind === 'code_fence_header' && active.context.codeFence) {
      const { languageStart } = active.context.codeFence;
      const before = text.slice(0, languageStart);
      const after = text.slice(active.end);
      const next = before + item.insertText + after;
      return { text: next, cursor: before.length + item.insertText.length };
    }

    const before = text.slice(0, active.end);
    const after = text.slice(active.end);
    const next = before + item.insertText + after;
    return { text: next, cursor: before.length + item.insertText.length };
  }

  if (active.type === 'slash') {
    const command = item.slashCommand;
    const insert = command
      ? resolveSlashInsert(command, text, active.slash.start)
      : item.insertText;
    const before = text.slice(0, active.slash.start);
    const after = text.slice(active.slash.end);
    const next = before + insert + after;
    return { text: next, cursor: before.length + insert.length };
  }

  const { start, end } = active.mention;
  const before = text.slice(0, start);
  const after = text.slice(end);
  const insert = `${active.mention.trigger}${item.insertText} `;
  const next = before + insert + after;
  return { text: next, cursor: before.length + insert.length };
}