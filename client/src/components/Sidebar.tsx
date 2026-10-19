import type { ReactNode } from 'react';
import type { AccessParents } from '../lib/channelAccess';
import type { Channel, ChannelUnreadInfo, ServerPage, UserRole } from '../types';
import { shouldShowChannelReadOnlyIcon, visibleChannels } from '../lib/permissions';
import { IconSettings, IconX, IconInfo, IconUsers, IconImage, IconSearch, IconLock } from './Icons';

interface Props {
  serverName: string;
  accessParents: AccessParents;
  channels: Channel[];
  activeChannelId: string;
  activeServerPage: ServerPage | null;
  userRole: UserRole;
  isAdmin: boolean;
  adminPanelOpen: boolean;
  flyoutOpen?: boolean;
  onSelectChannel: (id: string) => void;
  onOpenServerPage: (page: ServerPage) => void;
  onOpenAdmin: () => void;
  onCloseFlyout?: () => void;
  channelUnread?: Record<string, ChannelUnreadInfo>;
}

const publicServerTools: { page: ServerPage; icon: ReactNode; label: string }[] = [
  { page: 'info', icon: <IconInfo />, label: 'Server overview' },
  { page: 'members', icon: <IconUsers />, label: 'All members' },
  { page: 'media', icon: <IconImage />, label: 'Server media & links' },
  { page: 'search', icon: <IconSearch />, label: 'Search server' },
];

const adminServerTools: { page: ServerPage; icon: ReactNode; label: string }[] = [
  { page: 'settings', icon: <IconSettings />, label: 'Server settings' },
];

export function Sidebar({
  serverName,
  accessParents,
  channels,
  activeChannelId,
  activeServerPage,
  userRole,
  isAdmin,
  adminPanelOpen,
  flyoutOpen,
  onSelectChannel,
  onOpenServerPage,
  onOpenAdmin,
  onCloseFlyout,
  channelUnread = {},
}: Props) {
  const readableChannels = visibleChannels(channels, userRole, accessParents);
  const sortedCategories = [...accessParents.categories].sort((a, b) => a.position - b.position);
  const uncategorized = readableChannels
    .filter((c) => !c.categoryId)
    .sort((a, b) => a.position - b.position);
  const byCategory = sortedCategories
    .map((cat) => ({
      category: cat,
      channels: readableChannels
        .filter((c) => c.categoryId === cat.id)
        .sort((a, b) => a.position - b.position),
    }))
    .filter((group) => group.channels.length > 0);

  return (
    <aside className={`sidebar${flyoutOpen ? ' sidebar--open' : ''}`}>
      <div className="sidebar-header">
        <h2>{serverName}</h2>
        {onCloseFlyout && (
          <button className="sidebar-close tool-btn" onClick={onCloseFlyout} aria-label="Close channels">
            <IconX />
          </button>
        )}
      </div>
      <div className="sidebar-global-tools">
        {publicServerTools.map((t) => (
          <button
            key={t.page}
            className={`tool-btn ${activeServerPage === t.page ? 'active' : ''}`}
            title={t.label}
            onClick={() => onOpenServerPage(t.page)}
          >
            {t.icon}
          </button>
        ))}
        {isAdmin &&
          adminServerTools.map((t) => (
            <button
              key={t.page}
              className={`tool-btn ${activeServerPage === t.page ? 'active' : ''}`}
              title={t.label}
              onClick={() => onOpenServerPage(t.page)}
            >
              {t.icon}
            </button>
          ))}
      </div>
      <nav className="channel-list">
        {uncategorized.length > 0 && (
          <div className="channel-group">
            {uncategorized.map((ch) => (
              <ChannelButton
                key={ch.id}
                channel={ch}
                accessParents={accessParents}
                userRole={userRole}
                isAdmin={isAdmin}
                active={!activeServerPage && ch.id === activeChannelId}
                unread={channelUnread[ch.id]}
                onSelect={onSelectChannel}
              />
            ))}
          </div>
        )}
        {byCategory.map(({ category, channels: catChannels }) => (
          <div key={category.id} className="channel-group">
            <div className="channel-category">{category.name}</div>
            {catChannels.map((ch) => (
              <ChannelButton
                key={ch.id}
                channel={ch}
                accessParents={accessParents}
                userRole={userRole}
                isAdmin={isAdmin}
                active={!activeServerPage && ch.id === activeChannelId}
                unread={channelUnread[ch.id]}
                onSelect={onSelectChannel}
              />
            ))}
          </div>
        ))}
      </nav>
      {isAdmin && (
        <div className="sidebar-tools">
          <button
            className={`tool-btn ${adminPanelOpen ? 'active' : ''}`}
            title="Server admin"
            onClick={onOpenAdmin}
          >
            <IconSettings />
          </button>
        </div>
      )}
    </aside>
  );
}

function ChannelButton({
  channel,
  accessParents,
  userRole,
  isAdmin,
  active,
  unread,
  onSelect,
}: {
  channel: Channel;
  accessParents: AccessParents;
  userRole: UserRole;
  isAdmin: boolean;
  active: boolean;
  unread?: ChannelUnreadInfo;
  onSelect: (id: string) => void;
}) {
  const showReadOnly = shouldShowChannelReadOnlyIcon(channel, userRole, accessParents, isAdmin);
  const mentionCount = unread?.mentionCount ?? 0;
  const showMentionBadge = mentionCount > 0;
  const showUnreadDot = !!unread?.hasUnread && !showMentionBadge;

  return (
    <button
      className={`channel-item ${active ? 'active' : ''}`}
      onClick={() => onSelect(channel.id)}
    >
      <span className="hash">#</span>
      <span className="channel-item-name">{channel.name}</span>
      {showUnreadDot && (
        <span className="channel-unread-dot" title="Unread messages" aria-label="Unread messages" />
      )}
      {showMentionBadge && (
        <span className="channel-mention-badge" title={`${mentionCount} mention${mentionCount === 1 ? '' : 's'}`}>
          {mentionCount > 99 ? '99+' : mentionCount}
        </span>
      )}
      {showReadOnly && (
        <span className="channel-item-padlock" title="Read-only for you" aria-hidden="true">
          <IconLock />
        </span>
      )}
    </button>
  );
}