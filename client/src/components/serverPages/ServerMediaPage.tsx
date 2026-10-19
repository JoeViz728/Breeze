import type { Channel, LinkItem, MediaItem } from '../../types';
import { LinkPreviewCard } from '../LinkPreviewCard';
import { ServerPageShell } from '../ServerPageShell';

interface Props {
  media: MediaItem[];
  links: LinkItem[];
  channels: Channel[];
  onMessageLink?: (channelId: string, messageId: string) => void;
}

export function ServerMediaPage({ media, links, channels, onMessageLink }: Props) {
  const channelMap = new Map(channels.map((c) => [c.id, c.name]));

  return (
    <ServerPageShell title="Media & Links" subtitle="Everything shared across the server">
      <section className="server-page-section">
        <h3>Images & Videos ({media.length})</h3>
        {media.length === 0 ? (
          <p className="empty-state">No media shared yet.</p>
        ) : (
          <div className="media-grid media-grid--wide">
            {media.map((item) => (
              <a
                key={item.attachment.id}
                className="media-grid-item"
                href={item.attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                title={`#${channelMap.get(item.channelId) || 'channel'}`}
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
      </section>
      <section className="server-page-section">
        <h3>Shared Links ({links.length})</h3>
        {links.length === 0 ? (
          <p className="empty-state">No links shared yet.</p>
        ) : (
          <div className="links-list">
            {links.map((item, i) => (
              <LinkPreviewCard
                key={i}
                preview={item.preview}
                channelName={channelMap.get(item.channelId)}
                sharedAt={item.createdAt}
                onMessageLink={onMessageLink}
              />
            ))}
          </div>
        )}
      </section>
    </ServerPageShell>
  );
}