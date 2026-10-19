import { useEffect, useRef, useState } from 'react';
import type { User } from '../types';
import { IconMoreVertical } from './Icons';

interface Props {
  user: User;
  currentUserId: string;
  onEndSession: (userId: string) => void;
  onBan?: (userId: string) => void;
  onTimeout?: (userId: string, minutes: number) => void;
  onUnban?: (userId: string) => void;
}

export function MemberMenu({
  user,
  currentUserId,
  onEndSession,
  onBan,
  onTimeout,
  onUnban,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isSelf = user.id === currentUserId;
  const isBanned = user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now();
  const canModerate = user.role !== 'admin';

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function run(action: () => void) {
    action();
    setOpen(false);
  }

  return (
    <div className="member-menu" ref={rootRef}>
      <button
        className="member-menu-trigger tool-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Actions for ${user.username}`}
        aria-expanded={open}
      >
        <IconMoreVertical />
      </button>
      {open && (
        <div className="member-menu-dropdown" role="menu">
          {!isSelf && (
            <button
              className="member-menu-item"
              role="menuitem"
              onClick={() => run(() => onEndSession(user.id))}
            >
              End session
            </button>
          )}
          {canModerate && isBanned && onUnban && (
            <button
              className="member-menu-item"
              role="menuitem"
              onClick={() => run(() => onUnban(user.id))}
            >
              Unban
            </button>
          )}
          {canModerate && !isBanned && onTimeout && (
            <button
              className="member-menu-item"
              role="menuitem"
              onClick={() => run(() => onTimeout(user.id, 10))}
            >
              Timeout 10m
            </button>
          )}
          {canModerate && !isBanned && onBan && (
            <button
              className="member-menu-item member-menu-item--danger"
              role="menuitem"
              onClick={() => run(() => onBan(user.id))}
            >
              Ban
            </button>
          )}
        </div>
      )}
    </div>
  );
}