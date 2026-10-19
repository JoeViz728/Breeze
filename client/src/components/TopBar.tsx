import type { ReactNode } from 'react';
import type { Channel, ChannelPanelView } from '../types';
import { IconImage, IconSearch, IconInfo, IconMenu, IconUsers } from './Icons';

interface Props {
  channel: Channel | undefined;
  activePanel: ChannelPanelView | null;
  totalPingCount?: number;
  onTogglePanel: (view: ChannelPanelView) => void;
  onToggleSidebar?: () => void;
}

export function TopBar({
  channel,
  activePanel,
  totalPingCount = 0,
  onTogglePanel,
  onToggleSidebar,
}: Props) {
  const tools: { view: ChannelPanelView; icon: ReactNode; label: string }[] = [
    { view: 'info', icon: <IconInfo />, label: 'Channel info' },
    { view: 'members', icon: <IconUsers />, label: 'Channel members' },
    { view: 'media', icon: <IconImage />, label: 'Channel media & links' },
    { view: 'search', icon: <IconSearch />, label: 'Search channel' },
  ];

  return (
    <header className="topbar">
      <div className="topbar-center">
        {onToggleSidebar && (
          <button
            className="topbar-menu-btn tool-btn"
            onClick={onToggleSidebar}
            aria-label={
              totalPingCount > 0
                ? `Open channels, ${totalPingCount} mention${totalPingCount === 1 ? '' : 's'}`
                : 'Open channels'
            }
          >
            <IconMenu />
            {totalPingCount > 0 && (
              <span className="topbar-menu-badge" aria-hidden="true">
                {totalPingCount > 99 ? '99+' : totalPingCount}
              </span>
            )}
          </button>
        )}
        {channel && (
          <div className="topbar-channel-info">
            <div className="topbar-channel">#{channel.name}</div>
            {channel.topic && <div className="topbar-topic">{channel.topic}</div>}
          </div>
        )}
      </div>
      <div className="topbar-tools">
        {tools.map((t) => (
          <button
            key={t.view}
            className={`tool-btn ${activePanel === t.view ? 'active' : ''}`}
            title={t.label}
            onClick={() => onTogglePanel(t.view)}
          >
            {t.icon}
          </button>
        ))}
      </div>
    </header>
  );
}