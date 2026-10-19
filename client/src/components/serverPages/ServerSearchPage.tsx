import { useEffect, useRef, useState } from 'react';
import type { Channel, Message, User } from '../../types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { loadServerSearchSession, saveServerSearchSession } from '../../lib/searchSession';
import { SearchResultRow } from '../SearchResultRow';
import { ServerPageShell } from '../ServerPageShell';

interface Props {
  channels: Channel[];
  users: User[];
  onSearch: (query: string) => Promise<Message[]>;
  onJumpToMessage: (message: Message) => void;
}

export function ServerSearchPage({ channels, users, onSearch, onJumpToMessage }: Props) {
  const restored = useRef(loadServerSearchSession());
  const [query, setQuery] = useState(restored.current?.query ?? '');
  const debouncedQuery = useDebouncedValue(query, 1000);
  const [results, setResults] = useState<Message[]>(restored.current?.results ?? []);
  const [searched, setSearched] = useState(restored.current?.searched ?? false);
  const [loading, setLoading] = useState(false);

  const channelMap = new Map(channels.map((c) => [c.id, c.name]));
  const userMap = new Map(users.map((u) => [u.id, u.username]));

  useEffect(() => {
    saveServerSearchSession(query, results, searched);
  }, [query, results, searched]);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    onSearch(q)
      .then((messages) => {
        if (!cancelled) {
          setResults(messages);
          setSearched(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, onSearch]);

  return (
    <ServerPageShell title="Search" subtitle="Search messages across the server">
      <input
        className="search-input"
        type="text"
        placeholder="Search all channels…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {loading && <p className="search-status">Searching…</p>}
      {searched && !loading && results.length === 0 && (
        <p className="empty-state">No results found.</p>
      )}
      {results.map((msg) => (
        <SearchResultRow
          key={msg.id}
          message={msg}
          authorName={userMap.get(msg.userId) || 'Unknown'}
          channelName={channelMap.get(msg.channelId)}
          query={debouncedQuery}
          onJump={() => onJumpToMessage(msg)}
        />
      ))}
    </ServerPageShell>
  );
}