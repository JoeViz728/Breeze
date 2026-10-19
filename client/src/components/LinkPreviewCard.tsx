import type { LinkPreview } from '../types';
import { formatMessageDateTime } from '../lib/datetime';

interface Props {
  preview: LinkPreview;
  channelName?: string;
  sharedAt?: string;
  onMessageLink?: (channelId: string, messageId: string) => void;
}

const VIDEO_PREVIEW_EXT = /\.(mp4|webm|mov|ogg)(\?.*)?$/i;

function isVideoPreviewUrl(url: string): boolean {
  return VIDEO_PREVIEW_EXT.test(url);
}

function previewHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function previewSecondaryLabel(preview: LinkPreview, channelName?: string): string | null {
  if (preview.kind === 'message' && preview.siteName) return `in #${preview.siteName}`;
  if (channelName) return `in #${channelName}`;
  if (preview.siteName) return preview.siteName;
  return null;
}

function previewBodyText(preview: LinkPreview): string | null {
  if (preview.description?.trim()) return preview.description;
  if (preview.kind === 'message') return null;
  return preview.url;
}

function LinkPreviewMedia({ imageUrl }: { imageUrl: string }) {
  return (
    <div className="link-preview-card__media">
      {isVideoPreviewUrl(imageUrl) ? (
        <video src={imageUrl} muted loop playsInline preload="metadata" />
      ) : (
        <img src={imageUrl} alt="" loading="lazy" />
      )}
    </div>
  );
}

export function LinkPreviewCard({ preview, channelName, sharedAt, onMessageLink }: Props) {
  const isMessage = preview.kind === 'message';
  const secondary = previewSecondaryLabel(preview, channelName);
  const bodyText = previewBodyText(preview);
  const timestamp = preview.createdAt || sharedAt;
  const mediaUrl = preview.image;

  const content = (
    <>
      {mediaUrl && <LinkPreviewMedia imageUrl={mediaUrl} />}
      <div className="link-preview-card__body">
        <div className="search-result-meta">
          <span className="search-result-author">
            {preview.title || previewHostname(preview.url)}
          </span>
          {secondary && <span className="search-result-channel">{secondary}</span>}
          {timestamp && (
            <time className="search-result-time" dateTime={timestamp}>
              {formatMessageDateTime(timestamp)}
            </time>
          )}
        </div>
        {bodyText && <div className="search-result-text">{bodyText}</div>}
      </div>
    </>
  );

  if (isMessage) {
    const messageChannelId = preview.channelId;
    const messageId = preview.messageId;

    return (
      <div className="link-preview-card">
        <button
          type="button"
          className="search-result"
          onClick={() => {
            if (messageChannelId && messageId && onMessageLink) {
              onMessageLink(messageChannelId, messageId);
            }
          }}
          disabled={!messageChannelId || !messageId || !onMessageLink}
        >
          {content}
        </button>
      </div>
    );
  }

  return (
    <div className="link-preview-card">
      <a className="search-result" href={preview.url} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    </div>
  );
}