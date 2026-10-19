import type { Message } from '../types';
import { formatMessageDateTime } from '../lib/datetime';

interface Props {
  message: Message;
  authorName: string;
  query: string;
  channelName?: string;
  onJump: () => void;
}

export function SearchResultRow({ message, authorName, query, channelName, onJump }: Props) {
  return (
    <button type="button" className="search-result" onClick={onJump}>
      <div className="search-result-meta">
        <span className="search-result-author">{authorName}</span>
        {channelName && <span className="search-result-channel">in #{channelName}</span>}
        <time className="search-result-time" dateTime={message.createdAt}>
          {formatMessageDateTime(message.createdAt)}
        </time>
      </div>
      <div className="search-result-text">{highlightMatch(message.content, query)}</div>
    </button>
  );
}

function highlightMatch(text: string, query: string) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}