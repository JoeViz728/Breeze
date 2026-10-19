import { useState, useRef, useLayoutEffect, useMemo, KeyboardEvent, FormEvent } from 'react';
import type { AccessParents } from '../lib/channelAccess';
import type { Channel, User, UserRole } from '../types';
import {
  applySuggestion,
  buildSuggestions,
  getActiveInputContext,
  type SuggestionItem,
} from '../lib/inputSuggestions';
import { InputSuggestions } from './InputSuggestions';

interface Props {
  channelName: string;
  users: User[];
  channels: Channel[];
  accessParents: AccessParents;
  userRole: UserRole;
  onSend: (content: string) => void;
  onTyping: () => void;
}

const MAX_INPUT_HEIGHT = 120;

function resizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  const next = Math.min(el.scrollHeight, MAX_INPUT_HEIGHT);
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > MAX_INPUT_HEIGHT ? 'auto' : 'hidden';
}

export function MessageInput({ channelName, users, channels, accessParents, userRole, onSend, onTyping }: Props) {
  const [text, setText] = useState('');
  const [cursor, setCursor] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [suppressSuggestions, setSuppressSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const active = useMemo(() => getActiveInputContext(text, cursor), [text, cursor]);
  const suggestions = useMemo(
    () => (active ? buildSuggestions(active, users, channels, accessParents, userRole) : []),
    [active, users, channels, accessParents, userRole],
  );
  const showSuggestions = !!active && suggestions.length > 0 && !suppressSuggestions;

  useLayoutEffect(() => {
    resizeTextarea(textareaRef.current);
  }, [text]);

  useLayoutEffect(() => {
    setSelectedIndex(0);
    setSuppressSuggestions(false);
  }, [active]);

  function syncCursor() {
    const pos = textareaRef.current?.selectionStart ?? 0;
    setCursor(pos);
  }

  function handleChange(value: string) {
    setText(value);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(onTyping, 300);
  }

  function insertSuggestion(item: SuggestionItem) {
    if (!active || !item.insertText) return;
    const { text: next, cursor: nextCursor } = applySuggestion(text, active, item);
    setText(next);
    setCursor(nextCursor);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (showSuggestions && suggestions[selectedIndex]?.insertText) {
      insertSuggestion(suggestions[selectedIndex]);
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    setCursor(0);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Tab' && suggestions[selectedIndex]?.insertText) {
        e.preventDefault();
        insertSuggestion(suggestions[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSuppressSuggestions(true);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <div className="message-input-area">
      <div className="message-input-stack">
        {showSuggestions && (
          <InputSuggestions
            items={suggestions}
            selectedIndex={selectedIndex}
            onSelect={insertSuggestion}
            onHover={setSelectedIndex}
          />
        )}
        <form className="message-input-wrapper" onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={`Message #${channelName}`}
            value={text}
            onChange={(e) => {
              handleChange(e.target.value);
              setCursor(e.target.selectionStart ?? 0);
            }}
            onSelect={syncCursor}
            onKeyUp={syncCursor}
            onClick={syncCursor}
            onKeyDown={handleKeyDown}
          />
          <button type="submit" disabled={!text.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}