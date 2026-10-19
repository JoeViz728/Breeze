import { Fragment, useState, type ReactNode } from 'react';
import { findEarliestMention, type MentionMatch } from './mentions';
import {
  formatMessageLinkLabel,
  isSameServerMessageLink,
  parseMessageLinkUrl,
} from './messageLinks';
import type { Channel, User } from '../types';
import { CodeBlock } from '../components/CodeBlock';

export interface MarkupContext {
  users?: Pick<User, 'id' | 'username'>[];
  channels?: Pick<Channel, 'id' | 'name'>[];
  onChannelMention?: (channelId: string) => void;
  onMessageLink?: (channelId: string, messageId: string) => void;
}

function renderMessageLink(url: string, key: string, ctx?: MarkupContext): ReactNode | null {
  if (!isSameServerMessageLink(url)) return null;
  const link = parseMessageLinkUrl(url);
  if (!link) return null;

  const label = formatMessageLinkLabel(link.messageId);
  if (ctx?.onMessageLink) {
    return (
      <button
        key={key}
        type="button"
        className="md-message-link"
        onClick={() => ctx.onMessageLink!(link.channelId, link.messageId)}
      >
        {label}
      </button>
    );
  }

  return (
    <span key={key} className="md-message-link md-message-link--static">
      {label}
    </span>
  );
}

type InlineRule = {
  name: string;
  pattern: RegExp;
  render: (match: RegExpMatchArray, key: string, ctx?: MarkupContext) => ReactNode;
};

function Spoiler({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={`md-spoiler${open ? ' md-spoiler--open' : ''}`}
      onClick={() => setOpen(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen(true);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={open ? undefined : 'Spoiler, click to reveal'}
    >
      {children}
    </span>
  );
}

function renderMention(match: MentionMatch, key: string, ctx?: MarkupContext): ReactNode {
  if (match.kind === 'channel') {
    if (match.channelId && ctx?.onChannelMention) {
      return (
        <button
          key={key}
          type="button"
          className="md-channel-mention"
          onClick={() => ctx.onChannelMention!(match.channelId!)}
        >
          #{match.name}
        </button>
      );
    }
    return (
      <span key={key} className="md-channel-mention md-channel-mention--static">
        #{match.name}
      </span>
    );
  }

  if (match.kind === 'role') {
    return (
      <span key={key} className="md-mention md-mention--role">
        @{match.role}
      </span>
    );
  }

  return (
    <span key={key} className="md-mention">
      @{match.username}
    </span>
  );
}

const BASE_INLINE_RULES: InlineRule[] = [
  {
    name: 'code',
    pattern: /`([^`\n]+)`/,
    render: (m, key) => (
      <code key={key} className="md-inline-code">
        {m[1]}
      </code>
    ),
  },
  {
    name: 'spoiler',
    pattern: /\|\|([^|]+)\|\|/,
    render: (m, key, ctx) => (
      <Spoiler key={key}>{parseInline(m[1], `${key}-s`, ctx)}</Spoiler>
    ),
  },
  {
    name: 'link',
    pattern: /\[([^\]]+)\]\(([^)]+)\)/,
    render: (m, key, ctx) => {
      const messageLink = renderMessageLink(m[2], key, ctx);
      if (messageLink) return messageLink;
      return (
        <a key={key} href={m[2]} target="_blank" rel="noopener noreferrer">
          {parseInline(m[1], `${key}-l`, ctx)}
        </a>
      );
    },
  },
  {
    name: 'url',
    pattern: /https?:\/\/[^\s<>()]+/,
    render: (m, key, ctx) => {
      const messageLink = renderMessageLink(m[0], key, ctx);
      if (messageLink) return messageLink;
      return (
        <a key={key} href={m[0]} target="_blank" rel="noopener noreferrer">
          {m[0]}
        </a>
      );
    },
  },
  {
    name: 'bold',
    pattern: /\*\*(.+?)\*\*/s,
    render: (m, key, ctx) => (
      <strong key={key} className="md-bold">
        {parseInline(m[1], `${key}-b`, ctx)}
      </strong>
    ),
  },
  {
    name: 'underline',
    pattern: /__(.+?)__/s,
    render: (m, key, ctx) => (
      <span key={key} className="md-underline">
        {parseInline(m[1], `${key}-u`, ctx)}
      </span>
    ),
  },
  {
    name: 'strike',
    pattern: /~~(.+?)~~/s,
    render: (m, key, ctx) => (
      <del key={key} className="md-strike">
        {parseInline(m[1], `${key}-k`, ctx)}
      </del>
    ),
  },
  {
    name: 'italic',
    pattern: /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/s,
    render: (m, key, ctx) => (
      <em key={key} className="md-italic">
        {parseInline(m[1], `${key}-i`, ctx)}
      </em>
    ),
  },
  {
    name: 'italic_underscore',
    pattern: /(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/s,
    render: (m, key, ctx) => (
      <em key={key} className="md-italic">
        {parseInline(m[1], `${key}-iu`, ctx)}
      </em>
    ),
  },
];

function parseInline(text: string, keyPrefix = '0', ctx?: MarkupContext): ReactNode[] {
  if (!text) return [];

  let earliest: { index: number; length: number; node: ReactNode } | null = null;

  const mention = findEarliestMention(text, ctx?.users, ctx?.channels);
  if (mention) {
    earliest = {
      index: mention.index,
      length: mention.length,
      node: renderMention(mention, `${keyPrefix}-mention`, ctx),
    };
  }

  for (const rule of BASE_INLINE_RULES) {
    const match = rule.pattern.exec(text);
    if (!match || match.index === undefined) continue;
    if (!earliest || match.index < earliest.index) {
      earliest = {
        index: match.index,
        length: match[0].length,
        node: rule.render(match, `${keyPrefix}-${rule.name}`, ctx),
      };
    }
  }

  if (!earliest) return [text];

  const before = text.slice(0, earliest.index);
  const after = text.slice(earliest.index + earliest.length);

  return [
    ...parseInline(before, `${keyPrefix}-pre`, ctx),
    earliest.node,
    ...parseInline(after, `${keyPrefix}-post`, ctx),
  ];
}

function parseTextBlock(text: string, blockKey: string, ctx?: MarkupContext): ReactNode {
  const lines = text.split('\n');
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.startsWith('> ') || line === '>') {
      const quoteLines: string[] = [];
      while (index < lines.length && (lines[index].startsWith('> ') || lines[index] === '>')) {
        quoteLines.push(lines[index].startsWith('> ') ? lines[index].slice(2) : '');
        index += 1;
      }
      nodes.push(
        <blockquote key={`${blockKey}-q-${index}`} className="md-blockquote">
          {quoteLines.map((quoteLine, lineIndex) => (
            <Fragment key={lineIndex}>
              {lineIndex > 0 && <br />}
              {parseInline(quoteLine, `${blockKey}-q-${lineIndex}`, ctx)}
            </Fragment>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (index > 0) nodes.push(<br key={`${blockKey}-br-${index}`} />);
    nodes.push(
      <Fragment key={`${blockKey}-line-${index}`}>
        {parseInline(line, `${blockKey}-line-${index}`, ctx)}
      </Fragment>,
    );
    index += 1;
  }

  return <Fragment key={blockKey}>{nodes}</Fragment>;
}

export function parseMessageMarkup(text: string, ctx?: MarkupContext): ReactNode {
  if (!text) return null;

  const nodes: ReactNode[] = [];
  let remaining = text;
  let blockIndex = 0;

  while (remaining.length > 0) {
    const fenceStart = remaining.indexOf('```');
    if (fenceStart === -1) {
      nodes.push(parseTextBlock(remaining, `block-${blockIndex}`, ctx));
      break;
    }

    if (fenceStart > 0) {
      nodes.push(parseTextBlock(remaining.slice(0, fenceStart), `block-${blockIndex++}`, ctx));
    }

    remaining = remaining.slice(fenceStart + 3);
    const newline = remaining.indexOf('\n');
    const language = newline === -1 ? '' : remaining.slice(0, newline).trim();
    remaining = newline === -1 ? '' : remaining.slice(newline + 1);

    const fenceEnd = remaining.indexOf('```');
    const code = fenceEnd === -1 ? remaining : remaining.slice(0, fenceEnd);
    const trimmedCode = code.replace(/\n$/, '');

    nodes.push(
      <CodeBlock key={`fence-${blockIndex++}`} code={trimmedCode} language={language || undefined} />,
    );

    remaining = fenceEnd === -1 ? '' : remaining.slice(fenceEnd + 3);
  }

  if (nodes.length === 1) return nodes[0];
  return <>{nodes}</>;
}