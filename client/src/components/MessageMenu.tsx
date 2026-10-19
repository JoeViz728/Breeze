import { useEffect, useRef, useState } from 'react';
import { copyTextToClipboard } from '../lib/clipboard';
import { buildPath } from '../lib/routes';
import { IconMoreVertical } from './Icons';

interface Props {
  channelId: string;
  messageId: string;
  content?: string;
  canDelete?: boolean;
  onRequestDelete?: (messageId: string) => void;
}

function buildMessageLink(channelId: string, messageId: string): string {
  const path = buildPath({ view: 'channel', channelId, messageId });
  return `${window.location.origin}${path}`;
}

export function MessageMenu({ channelId, messageId, content, canDelete, onRequestDelete }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const canCopyMessage = !!content?.trim();

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function run(action: () => void | Promise<void>) {
    await action();
    setOpen(false);
  }

  return (
    <div className={`message-menu${open ? ' message-menu--open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="message-menu-trigger tool-btn"
        onClick={() => setOpen((value) => !value)}
        aria-label="Message actions"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <IconMoreVertical />
      </button>
      {open && (
        <div className="message-menu-dropdown" role="menu">
          {canCopyMessage && (
            <button
              type="button"
              className="message-menu-item"
              role="menuitem"
              onClick={() => void run(async () => { await copyTextToClipboard(content!); })}
            >
              Copy message
            </button>
          )}
          <button
            type="button"
            className="message-menu-item"
            role="menuitem"
            onClick={() => void run(async () => { await copyTextToClipboard(buildMessageLink(channelId, messageId)); })}
          >
            Copy message link
          </button>
          {canDelete && onRequestDelete && (
            <button
              type="button"
              className="message-menu-item message-menu-item--danger"
              role="menuitem"
              onClick={() => run(() => onRequestDelete(messageId))}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}