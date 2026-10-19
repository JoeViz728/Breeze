import { useEffect } from 'react';
import type { Channel, Message, User } from '../types';
import { MessageContent } from './MessageContent';

interface Props {
  message: Message;
  authorName: string;
  users: Pick<User, 'id' | 'username'>[];
  channels?: Pick<Channel, 'id' | 'name'>[];
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export function DeleteMessageModal({
  message,
  authorName,
  users,
  channels,
  onConfirm,
  onCancel,
  busy = false,
}: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel, busy]);

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onCancel} role="presentation">
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-message-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="delete-message-title" className="modal-title">
          Delete message?
        </h3>
        <p className="modal-explainer">
          Deleting this message will remove it from the chat log and replace it with a
          &ldquo;Message deleted.&rdquo; notice for everyone. The message itself stays on record
          internally.
        </p>
        <div className="modal-message-preview">
          <div className="modal-message-preview-meta">
            <span className="modal-message-preview-author">{authorName}</span>
          </div>
          <div className="modal-message-preview-body">
            <MessageContent content={message.content} users={users} channels={channels} />
          </div>
          {message.attachments.length > 0 && (
            <p className="modal-message-preview-extra">
              {message.attachments.length} attachment{message.attachments.length === 1 ? '' : 's'}{' '}
              will also be hidden.
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="modal-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="modal-btn modal-btn--danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete message'}
          </button>
        </div>
      </div>
    </div>
  );
}