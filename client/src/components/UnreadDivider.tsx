import { IconBookmark } from './Icons';

export function UnreadDivider() {
  return (
    <div className="unread-divider" role="separator" aria-label="New messages">
      <span className="unread-divider-line" aria-hidden="true" />
      <span className="unread-divider-label">
        <IconBookmark />
        <span>New messages</span>
      </span>
      <span className="unread-divider-line" aria-hidden="true" />
    </div>
  );
}