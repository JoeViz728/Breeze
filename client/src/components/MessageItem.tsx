import { useState } from 'react';
import { messageMentionsUser } from '../lib/mentions';
import type { Channel, Message, User } from '../types';
import { LinkPreviewCard } from './LinkPreviewCard';
import { MessageContent } from './MessageContent';
import { MessageMenu } from './MessageMenu';

interface Props {
  message: Message;
  user: User | undefined;
  users: Pick<User, 'id' | 'username'>[];
  channels?: Pick<Channel, 'id' | 'name'>[];
  currentUserId?: string;
  showHeader: boolean;
  isAdmin?: boolean;
  onRequestDelete?: (messageId: string) => void;
  onChannelMention?: (channelId: string) => void;
  onMessageLink?: (channelId: string, messageId: string) => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MessageExtras({
  message,
  onMessageLink,
}: {
  message: Message;
  onMessageLink?: (channelId: string, messageId: string) => void;
}) {
  return (
    <>
      {message.attachments.length > 0 && (
        <div className="message-attachments">
          {message.attachments.map((att) =>
            att.type === 'image' ? (
              <img key={att.id} src={att.url} alt={att.filename} loading="lazy" />
            ) : (
              <video key={att.id} src={att.url} controls preload="metadata" />
            )
          )}
        </div>
      )}
      {message.linkPreviews.map((preview, i) => (
        <LinkPreviewCard key={i} preview={preview} onMessageLink={onMessageLink} />
      ))}
    </>
  );
}

function DeletedNotice({ isAdmin, revealed, onRead, onHide }: {
  isAdmin: boolean;
  revealed: boolean;
  onRead: () => void;
  onHide: () => void;
}) {
  return (
    <div className="message-deleted">
      <span className="message-deleted-notice">Message deleted.</span>
      {isAdmin && !revealed && (
        <button type="button" className="message-deleted-read" onClick={onRead}>
          Read
        </button>
      )}
      {isAdmin && revealed && (
        <button type="button" className="message-deleted-read" onClick={onHide}>
          Hide
        </button>
      )}
    </div>
  );
}

export function MessageItem({
  message,
  user,
  users,
  channels,
  currentUserId,
  showHeader,
  isAdmin,
  onRequestDelete,
  onChannelMention,
  onMessageLink,
}: Props) {
  const [revealed, setRevealed] = useState(false);
  const initial = user?.username?.[0]?.toUpperCase() || '?';
  const isDeleted = !!message.deleted;
  const showContent = !isDeleted || (isAdmin && revealed);
  const showDelete = isAdmin && onRequestDelete && !isDeleted;
  const mentionsYou =
    !isDeleted &&
    !!currentUserId &&
    messageMentionsUser(message.content, currentUserId, users);
  const groupClass = `message-group${!showHeader ? ' message-group--compact' : ''}${
    mentionsYou ? ' message-group--mentioned' : ''
  }${isDeleted ? ' message-group--deleted' : ''}`;

  const menu = (
    <MessageMenu
      channelId={message.channelId}
      messageId={message.id}
      content={showContent ? message.content : undefined}
      canDelete={showDelete}
      onRequestDelete={onRequestDelete}
    />
  );

  const content = showContent ? (
    <MessageContent
      content={message.content}
      users={users}
      channels={channels}
      onChannelMention={onChannelMention}
      onMessageLink={onMessageLink}
    />
  ) : (
    <DeletedNotice
      isAdmin={!!isAdmin}
      revealed={revealed}
      onRead={() => setRevealed(true)}
      onHide={() => setRevealed(false)}
    />
  );

  if (!showHeader) {
    return (
      <div className={groupClass} id={`message-${message.id}`}>
        <div className="message-body">
          <div className="message-compact-row">
            <div className="message-content">{content}</div>
            <div className="message-compact-actions">
              <span className="message-time">{formatTime(message.createdAt)}</span>
              {menu}
            </div>
          </div>
          {showContent && <MessageExtras message={message} onMessageLink={onMessageLink} />}
        </div>
      </div>
    );
  }

  return (
    <div className={groupClass} id={`message-${message.id}`}>
      <div className="message-avatar" style={{ background: user?.avatarColor || '#9a948d' }}>
        {initial}
      </div>
      <div className="message-body">
        <div className="message-header">
          <span className="message-author">{user?.username || 'Unknown'}</span>
          <span className="message-time">{formatTime(message.createdAt)}</span>
          <div className="message-actions">{menu}</div>
        </div>
        <div className="message-content">{content}</div>
        {showContent && <MessageExtras message={message} onMessageLink={onMessageLink} />}
      </div>
    </div>
  );
}