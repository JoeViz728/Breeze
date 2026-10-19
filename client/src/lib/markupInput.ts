export type MarkupContextKind =
  | 'code_fence'
  | 'code_fence_header'
  | 'inline_code'
  | 'spoiler'
  | 'link_label'
  | 'link_between'
  | 'link_url'
  | 'bold'
  | 'underline'
  | 'strike'
  | 'italic'
  | 'italic_underscore'
  | 'blockquote';

export interface CodeFenceHeaderState {
  languageStart: number;
  languageQuery: string;
}

export interface MarkupInputContext {
  kind: MarkupContextKind;
  label: string;
  hint: string;
  syntax?: string;
  closeText?: string;
  codeFence?: CodeFenceHeaderState;
}

const MARKUP_HINTS: Record<MarkupContextKind, Omit<MarkupInputContext, 'kind'>> = {
  code_fence: {
    label: 'Code block',
    hint: 'Close with ```',
    syntax: '```',
    closeText: '```',
  },
  code_fence_header: {
    label: 'Code block',
    hint: 'Optional language, then newline',
    syntax: '```',
  },
  inline_code: {
    label: 'Inline code',
    hint: 'Close with `',
    syntax: '`',
    closeText: '`',
  },
  spoiler: {
    label: 'Spoiler',
    hint: 'Type content, then close with ||',
    syntax: '||',
    closeText: '||',
  },
  link_label: {
    label: 'Link',
    hint: 'Type label text, then ]',
    syntax: '[',
    closeText: ']',
  },
  link_between: {
    label: 'Link',
    hint: 'Type (url)',
    syntax: ']',
    closeText: '(',
  },
  link_url: {
    label: 'Link',
    hint: 'Type URL, then )',
    syntax: '(',
    closeText: ')',
  },
  bold: {
    label: 'Bold',
    hint: 'Type content, then close with **',
    syntax: '**',
    closeText: '**',
  },
  underline: {
    label: 'Underline',
    hint: 'Type content, then close with __',
    syntax: '__',
    closeText: '__',
  },
  strike: {
    label: 'Strikethrough',
    hint: 'Type content, then close with ~~',
    syntax: '~~',
    closeText: '~~',
  },
  italic: {
    label: 'Italic',
    hint: 'Type content, then close with *',
    syntax: '*',
    closeText: '*',
  },
  italic_underscore: {
    label: 'Italic',
    hint: 'Type content, then close with _',
    syntax: '_',
    closeText: '_',
  },
  blockquote: {
    label: 'Quote',
    hint: 'Blockquote line — start with >',
    syntax: '>',
  },
};

function contextFromKind(kind: MarkupContextKind): MarkupInputContext {
  return { kind, ...MARKUP_HINTS[kind] };
}

function toggleStack(stack: MarkupContextKind[], kind: MarkupContextKind) {
  if (stack[stack.length - 1] === kind) stack.pop();
  else stack.push(kind);
}

function scanInlineMarkup(text: string, cursor: number): MarkupContextKind | null {
  const stack: MarkupContextKind[] = [];
  let i = 0;

  while (i < cursor) {
    if (text.slice(i, i + 3) === '```') {
      i += 3;
      continue;
    }

    if (stack[stack.length - 1] === 'inline_code') {
      if (text[i] === '`') stack.pop();
      i += 1;
      continue;
    }

    if (text.slice(i, i + 2) === '**') {
      toggleStack(stack, 'bold');
      i += 2;
      continue;
    }

    if (text.slice(i, i + 2) === '__') {
      toggleStack(stack, 'underline');
      i += 2;
      continue;
    }

    if (text.slice(i, i + 2) === '~~') {
      toggleStack(stack, 'strike');
      i += 2;
      continue;
    }

    if (text.slice(i, i + 2) === '||') {
      toggleStack(stack, 'spoiler');
      i += 2;
      continue;
    }

    if (text[i] === '`') {
      stack.push('inline_code');
      i += 1;
      continue;
    }

    if (text[i] === '[' && stack[stack.length - 1] !== 'link_label') {
      stack.push('link_label');
      i += 1;
      continue;
    }

    if (text[i] === ']' && stack[stack.length - 1] === 'link_label') {
      stack.pop();
      stack.push('link_between');
      i += 1;
      continue;
    }

    if (text[i] === '(' && stack[stack.length - 1] === 'link_between') {
      stack.pop();
      stack.push('link_url');
      i += 1;
      continue;
    }

    if (text[i] === ')' && stack[stack.length - 1] === 'link_url') {
      stack.pop();
      i += 1;
      continue;
    }

    if (text[i] === '*' && text[i - 1] !== '*' && text[i + 1] !== '*') {
      toggleStack(stack, 'italic');
      i += 1;
      continue;
    }

    if (text[i] === '_' && text[i - 1] !== '_' && text[i + 1] !== '_') {
      toggleStack(stack, 'italic_underscore');
      i += 1;
      continue;
    }

    i += 1;
  }

  return stack.length > 0 ? stack[stack.length - 1] : null;
}

function isInCodeFence(text: string, cursor: number): boolean {
  const before = text.slice(0, cursor);
  const fences = before.match(/```/g);
  return !!fences && fences.length % 2 === 1;
}

function getCodeFenceContext(text: string, cursor: number): MarkupInputContext | null {
  if (!isInCodeFence(text, cursor)) return null;

  const lastFence = text.slice(0, cursor).lastIndexOf('```');
  const afterFence = text.slice(lastFence + 3, cursor);
  if (!afterFence.includes('\n')) {
    return {
      ...contextFromKind('code_fence_header'),
      codeFence: {
        languageStart: lastFence + 3,
        languageQuery: afterFence,
      },
    };
  }
  return contextFromKind('code_fence');
}

function isOnBlockquoteLine(text: string, cursor: number): boolean {
  const lineStart = text.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
  const lineBeforeCursor = text.slice(lineStart, cursor);
  return /^> ?$/.test(lineBeforeCursor);
}

export function getMarkupInputContext(text: string, cursor: number): MarkupInputContext | null {
  const fenceContext = getCodeFenceContext(text, cursor);
  if (fenceContext) return fenceContext;

  const inlineKind = scanInlineMarkup(text, cursor);
  if (inlineKind) return contextFromKind(inlineKind);

  if (isOnBlockquoteLine(text, cursor)) return contextFromKind('blockquote');

  return null;
}