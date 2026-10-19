import { useEffect, useRef } from 'react';
import type { SuggestionItem } from '../lib/inputSuggestions';

interface Props {
  items: SuggestionItem[];
  selectedIndex: number;
  onSelect: (item: SuggestionItem) => void;
  onHover: (index: number) => void;
}

export function InputSuggestions({ items, selectedIndex, onSelect, onHover }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>('[data-selected="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (items.length === 0) return null;

  return (
    <div className="input-suggestions" ref={listRef} role="listbox" aria-label="Suggestions">
      {items.map((item, index) => {
        const initial = item.label[0]?.toUpperCase() || '?';
        const selected = index === selectedIndex;

        return (
          <button
            key={item.id}
            type="button"
            className={`input-suggestion${selected ? ' input-suggestion--selected' : ''}`}
            role="option"
            aria-selected={selected}
            data-selected={selected ? 'true' : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => onHover(index)}
            onClick={() => onSelect(item)}
          >
            {item.kind === 'user' ? (
              <span className="input-suggestion-avatar" style={{ background: item.avatarColor || '#9a948d' }}>
                {initial}
              </span>
            ) : item.kind === 'markup' ? (
              <span className="input-suggestion-icon input-suggestion-icon--markup">
                {item.syntax || 'Aa'}
              </span>
            ) : item.kind === 'slash' ? (
              <span className="input-suggestion-icon input-suggestion-icon--slash">/</span>
            ) : (
              <span className={`input-suggestion-icon input-suggestion-icon--${item.kind}`}>
                {item.kind === 'channel' ? '#' : '@'}
              </span>
            )}
            <span className="input-suggestion-body">
              <span className="input-suggestion-label">{item.label}</span>
              {item.subtitle && (
                <span
                  className={`input-suggestion-sub${
                    item.kind === 'slash' || item.subtitle === 'Code block language'
                      ? ' input-suggestion-sub--category'
                      : ''
                  }`}
                >
                  {item.subtitle}
                </span>
              )}
              {item.description && (
                <span className="input-suggestion-desc">{item.description}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}