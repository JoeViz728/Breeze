export type SlashCommandKind = 'markup';

export interface SlashCommand {
  id: string;
  kind: SlashCommandKind;
  name: string;
  label: string;
  insertText: string;
  description: string;
  syntax: string;
  aliases?: string[];
}

export function slashCommandCategoryLabel(command: SlashCommand): string {
  if (command.kind === 'markup') return `Insert markup: ${command.label}`;
  return command.label;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'inline-code',
    kind: 'markup',
    name: 'inline-code',
    label: 'Inline code',
    insertText: '`',
    description: 'Inserts ` and opens inline code',
    syntax: '`',
    aliases: ['code'],
  },
  {
    id: 'bold',
    kind: 'markup',
    name: 'bold',
    label: 'Bold',
    insertText: '**',
    description: 'Inserts ** and opens bold text',
    syntax: '**',
  },
  {
    id: 'italic',
    kind: 'markup',
    name: 'italic',
    label: 'Italic',
    insertText: '*',
    description: 'Inserts * and opens italic text',
    syntax: '*',
  },
  {
    id: 'italic-underscore',
    kind: 'markup',
    name: 'italic-underscore',
    label: 'Italic (underscore)',
    insertText: '_',
    description: 'Inserts _ and opens italic text',
    syntax: '_',
    aliases: ['underscore-italic', 'italic-underline'],
  },
  {
    id: 'underline',
    kind: 'markup',
    name: 'underline',
    label: 'Underline',
    insertText: '__',
    description: 'Inserts __ and opens underlined text',
    syntax: '__',
  },
  {
    id: 'strike',
    kind: 'markup',
    name: 'strike',
    label: 'Strikethrough',
    insertText: '~~',
    description: 'Inserts ~~ and opens strikethrough text',
    syntax: '~~',
    aliases: ['strikethrough'],
  },
  {
    id: 'spoiler',
    kind: 'markup',
    name: 'spoiler',
    label: 'Spoiler',
    insertText: '||',
    description: 'Inserts || and opens spoiler text',
    syntax: '||',
  },
  {
    id: 'link',
    kind: 'markup',
    name: 'link',
    label: 'Link',
    insertText: '[',
    description: 'Inserts [ and opens a link label',
    syntax: '[',
  },
  {
    id: 'quote',
    kind: 'markup',
    name: 'quote',
    label: 'Quote',
    insertText: '> ',
    description: 'Inserts > and starts a blockquote line',
    syntax: '>',
    aliases: ['blockquote'],
  },
  {
    id: 'code-block',
    kind: 'markup',
    name: 'code-block',
    label: 'Code block',
    insertText: '```',
    description: 'Inserts ``` and opens a fenced code block',
    syntax: '```',
    aliases: ['code-fence', 'fence'],
  },
];

function commandSearchTerms(command: SlashCommand): string[] {
  return [command.name, ...(command.aliases ?? [])];
}

export function matchesSlashQuery(command: SlashCommand, query: string): boolean {
  const normalized = query.toLowerCase();
  return commandSearchTerms(command).some(
    (term) => term.startsWith(normalized) || term.includes(normalized),
  );
}

export function filterSlashCommands(query: string): SlashCommand[] {
  const normalized = query.toLowerCase();
  const matches = SLASH_COMMANDS.filter((command) => matchesSlashQuery(command, normalized));
  return matches
    .sort((a, b) => {
      const aStarts = commandSearchTerms(a).some((term) => term.startsWith(normalized));
      const bStarts = commandSearchTerms(b).some((term) => term.startsWith(normalized));
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 8);
}

export function resolveSlashInsert(command: SlashCommand, text: string, start: number): string {
  const atLineStart = start === 0 || text[start - 1] === '\n';

  if (command.id === 'quote') {
    return atLineStart ? '> ' : '\n> ';
  }

  if (command.id === 'code-block') {
    return atLineStart ? '```' : '\n```';
  }

  return command.insertText;
}