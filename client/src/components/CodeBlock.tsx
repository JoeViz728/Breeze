import { useMemo, useState, type KeyboardEvent } from 'react';
import { copyTextToClipboard } from '../lib/clipboard';
import { highlightCode } from '../lib/codeHighlight';

interface Props {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: Props) {
  const [copied, setCopied] = useState(false);
  const trimmedLanguage = language?.trim() ?? '';

  const highlighted = useMemo(
    () => highlightCode(code, trimmedLanguage || undefined),
    [code, trimmedLanguage],
  );

  async function handleCopy() {
    const ok = await copyTextToClipboard(code);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void handleCopy();
    }
  }

  return (
    <div
      className={`md-code-block${copied ? ' md-code-block--copied' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => void handleCopy()}
      onKeyDown={handleKeyDown}
      aria-label={copied ? 'Copied' : 'Copy code'}
      title={copied ? 'Copied' : 'Tap to copy code'}
    >
      <pre className="md-pre">
        <code
          className={`md-code hljs${trimmedLanguage ? ` language-${trimmedLanguage}` : ''}`}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
}