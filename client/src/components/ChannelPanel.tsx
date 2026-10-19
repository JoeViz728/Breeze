import { useState, useMemo, useEffect } from 'react';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { loadChannelSearchQuery, saveChannelSearchQuery } from '../lib/searchSession';
import type { AccessParents } from '../lib/channelAccess';
import { resolveChannelAccess } from '../lib/channelAccess';
import type { Channel, ChannelPanelView, LinkItem, MediaItem, Message, User } from '../types';
import { accessLabel, canReadChannel, isMemberOnline, isUserBanned } from '../lib/permissions';
import { IconX } from './Icons';
import { MemberAccessIcon } from './MemberAccessIcon';
import { MemberMenu } from './MemberMenu';
import { LinkPreviewCard } from './LinkPreviewCard';
import { SearchResultRow } from './SearchResultRow';

interface Props {
  view: ChannelPanelView;
  channel: Channel;
  accessParents: AccessParents;
  users: User[];
  isAdmin: boolean;
  currentUserId: string;
  media: MediaItem[];
  links: LinkItem[];
  messages: Message[];
  messageCount?: number;
  onClose: () => void;
  onJumpToMessage: (message: Message) => void;
  onMessageLink?: (channelId: string, messageId: string) => void;
  onEndSession?: (id: string) => void | Promise<void>;
  onBanUser?: (id: string) => void | Promise<void>;
  onTimeoutUser?: (id: string, minutes: number) => void | Promise<void>;
  onUnbanUser?: (id: string) => void | Promise<void>;
}

const titles: Record<ChannelPanelView, string> = {
  info: 'Channel Info',
  members: 'Members',
  media: 'Media & Links',
  search: 'Search',
};

export function ChannelPanel({
  view,
  channel,
  accessParents,
  users,
  isAdmin,
  currentUserId,
  media,
  links,
  messages,
  messageCount,
  onClose,
  onJumpToMessage,
  onMessageLink,
  onEndSession,
  onBanUser,
  onTimeoutUser,
  onUnbanUser,
}: Props) {
  const [query, setQuery] = useState(() => loadChannelSearchQuery(channel.id));
  const debouncedQuery = useDebouncedValue(query, 1000);

  useEffect(() => {
    setQuery(loadChannelSearchQuery(channel.id));
  }, [channel.id]);

  useEffect(() => {
    saveChannelSearchQuery(channel.id, query);
  }, [channel.id, query]);

  const searchResults = useMemo(() => {
    if (!debouncedQuery.trim()) return [];
    const q = debouncedQuery.toLowerCase();
    return messages.filter((m) => m.content.toLowerCase().includes(q)).slice(0, 20);
  }, [messages, debouncedQuery]);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.username])), [users]);
  const effectiveAccess = useMemo(
    () => resolveChannelAccess(channel, accessParents),
    [channel, accessParents],
  );

  const visibleMembers = useMemo(
    () => users.filter((u) => canReadChannel(channel, u.role, accessParents)),
    [users, channel, accessParents],
  );
  const onlineMembers = useMemo(
    () => visibleMembers.filter((u) => isMemberOnline(u)),
    [visibleMembers],
  );
  const offlineMembers = useMemo(
    () => visibleMembers.filter((u) => !isMemberOnline(u)),
    [visibleMembers],
  );

  return (
    <aside className="right-panel">
      <div className="panel-header">
        <h3>{titles[view]}</h3>
        <button className="panel-close" onClick={onClose} title="Close panel">
          <IconX />
        </button>
      </div>
      <div className="panel-content">
        {view === 'info' && (
          <>
            <div className="panel-section">
              <h4>Topic</h4>
              <p>{channel.topic || 'No topic set.'}</p>
            </div>
            <div className="panel-section">
              <h4>About</h4>
              <p>{channel.description || 'No description.'}</p>
            </div>
            <div className="panel-section">
              <h4>Access</h4>
              <p>{accessLabel(effectiveAccess.readAccess, effectiveAccess.writeAccess)}</p>
            </div>
            {messageCount !== undefined && (
              <div className="panel-section">
                <h4>Messages</h4>
                <p>{messageCount.toLocaleString()}</p>
              </div>
            )}
          </>
        )}

        {view === 'members' && (
          <>
            <p className="panel-subtitle">{visibleMembers.length} can view this channel</p>
            <ChannelMemberSection
              title={`Online — ${onlineMembers.length}`}
              users={onlineMembers}
              channel={channel}
              accessParents={accessParents}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              onEndSession={onEndSession}
              onBanUser={onBanUser}
              onTimeoutUser={onTimeoutUser}
              onUnbanUser={onUnbanUser}
            />
            <ChannelMemberSection
              title={`Offline — ${offlineMembers.length}`}
              users={offlineMembers}
              channel={channel}
              accessParents={accessParents}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              onEndSession={onEndSession}
              onBanUser={onBanUser}
              onTimeoutUser={onTimeoutUser}
              onUnbanUser={onUnbanUser}
            />
            {visibleMembers.length === 0 && (
              <p className="empty-state">No members can view this channel.</p>
            )}
          </>
        )}

        {view === 'media' && (
          <>
            <div className="panel-section">
              <h4>Images & Videos ({media.length})</h4>
              {media.length === 0 ? (
                <p className="empty-state">No media in this channel yet.</p>
              ) : (
                <div className="media-grid">
                  {media.map((item) => (
                    <a
                      key={item.attachment.id}
                      className="media-grid-item"
                      href={item.attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {item.attachment.type === 'image' ? (
                        <img src={item.attachment.url} alt="" loading="lazy" />
                      ) : (
                        <video src={item.attachment.url} preload="metadata" />
                      )}
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div className="panel-section">
              <h4>Shared Links ({links.length})</h4>
              {links.length === 0 ? (
                <p className="empty-state">No links in this channel yet.</p>
              ) : (
                <div className="links-list">
                  {links.map((item, i) => (
                    <LinkPreviewCard
                      key={i}
                      preview={item.preview}
                      channelName={channel.name}
                      sharedAt={item.createdAt}
                      onMessageLink={onMessageLink}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {view === 'search' && (
          <>
            <input
              className="search-input"
              type="text"
              placeholder="Search this channel…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {debouncedQuery.trim() && searchResults.length === 0 && (
              <p className="empty-state">No results in this channel.</p>
            )}
            {searchResults.map((msg) => (
              <SearchResultRow
                key={msg.id}
                message={msg}
                authorName={userMap.get(msg.userId) || 'Unknown'}
                query={debouncedQuery}
                onJump={() => onJumpToMessage(msg)}
              />
            ))}
          </>
        )}
      </div>
    </aside>
  );
}

function ChannelMemberSection({
  title,
  users,
  channel,
  accessParents,
  isAdmin,
  currentUserId,
  onEndSession,
  onBanUser,
  onTimeoutUser,
  onUnbanUser,
}: {
  title: string;
  users: User[];
  channel: Channel;
  accessParents: AccessParents;
  isAdmin: boolean;
  currentUserId: string;
  onEndSession?: (id: string) => void | Promise<void>;
  onBanUser?: (id: string) => void | Promise<void>;
  onTimeoutUser?: (id: string, minutes: number) => void | Promise<void>;
  onUnbanUser?: (id: string) => void | Promise<void>;
}) {
  if (users.length === 0) return null;
  return (
    <div className="panel-section">
      <h4>{title}</h4>
      {users.map((u) => (
        <div
          key={u.id}
          className={`member-item member-item--spread server-member-row${isUserBanned(u) ? ' member-item--banned' : ''}`}
        >
          <div className="member-avatar" style={{ background: u.avatarColor }}>
            {u.username[0].toUpperCase()}
          </div>
          <span className="member-name">{u.username}</span>
          {u.role === 'admin' && <span className="admin-badge">Admin</span>}
          <MemberAccessIcon user={u} channel={channel} accessParents={accessParents} />
          {!isUserBanned(u) && (
            <span className={`member-status ${isMemberOnline(u) ? 'online' : u.status}`} />
          )}
          {isAdmin && onEndSession && u.id !== currentUserId && (
            <MemberMenu
              user={u}
              currentUserId={currentUserId}
              onEndSession={onEndSession}
              onBan={onBanUser}
              onTimeout={onTimeoutUser}
              onUnban={onUnbanUser}
            />
          )}
        </div>
      ))}
    </div>
  );
}

